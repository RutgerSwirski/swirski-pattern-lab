import { expect, test, type Page } from "@playwright/test";

const VIEWPORT = {
  width: 1280,
  height: 800,
};
const MM_TO_PX = 2;

function patternPointToScreen(point: { x: number; y: number }) {
  return {
    x: VIEWPORT.width / 2 + point.x * MM_TO_PX,
    y: VIEWPORT.height / 2 + point.y * MM_TO_PX,
  };
}

async function openEditor(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.waitForTimeout(100);
}

async function countGreenPixels(page: Page) {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    let count = 0;

    canvases.forEach((canvas) => {
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      const image = context.getImageData(0, 0, canvas.width, canvas.height);

      for (let index = 0; index < image.data.length; index += 4) {
        const red = image.data[index];
        const green = image.data[index + 1];
        const blue = image.data[index + 2];
        const alpha = image.data[index + 3];

        if (alpha > 0 && red < 80 && green > 100 && blue < 140) {
          count += 1;
        }
      }
    });

    return count;
  });
}

async function countGreenPixelsNear(
  page: Page,
  point: { x: number; y: number },
  radius = 18,
) {
  return page.evaluate(
    ({ samplePoint, sampleRadius }) => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      let count = 0;

      canvases.forEach((canvas) => {
        const context = canvas.getContext("2d");

        if (!context) {
          return;
        }

        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const centerX = Math.round(samplePoint.x * scaleX);
        const centerY = Math.round(samplePoint.y * scaleY);
        const radiusX = Math.round(sampleRadius * scaleX);
        const radiusY = Math.round(sampleRadius * scaleY);
        const left = Math.max(0, centerX - radiusX);
        const top = Math.max(0, centerY - radiusY);
        const width = Math.min(canvas.width - left, radiusX * 2);
        const height = Math.min(canvas.height - top, radiusY * 2);

        if (width <= 0 || height <= 0) {
          return;
        }

        const image = context.getImageData(left, top, width, height);

        for (let index = 0; index < image.data.length; index += 4) {
          const red = image.data[index];
          const green = image.data[index + 1];
          const blue = image.data[index + 2];
          const alpha = image.data[index + 3];

          if (alpha > 0 && red < 80 && green > 100 && blue < 140) {
            count += 1;
          }
        }
      });

      return count;
    },
    { samplePoint: point, sampleRadius: radius },
  );
}

async function storeCanvasSnapshot(page: Page, name: string) {
  await page.evaluate((snapshotName) => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const snapshots = canvases.map((canvas) => {
      const context = canvas.getContext("2d");

      if (!context) {
        return null;
      }

      return {
        data: Array.from(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
        height: canvas.height,
        width: canvas.width,
      };
    });
    const testWindow = window as Window & {
      __patternLabSnapshots?: Record<string, typeof snapshots>;
    };

    testWindow.__patternLabSnapshots = {
      ...testWindow.__patternLabSnapshots,
      [snapshotName]: snapshots,
    };
  }, name);
}

async function countCanvasDiff(page: Page, name: string) {
  return page.evaluate((snapshotName) => {
    const testWindow = window as Window & {
      __patternLabSnapshots?: Record<
        string,
        Array<{ data: number[]; height: number; width: number } | null>
      >;
    };
    const snapshots = testWindow.__patternLabSnapshots?.[snapshotName];

    if (!snapshots) {
      throw new Error(`Missing canvas snapshot ${snapshotName}`);
    }

    return Array.from(document.querySelectorAll("canvas")).reduce(
      (diffCount, canvas, canvasIndex) => {
        const snapshot = snapshots[canvasIndex];
        const context = canvas.getContext("2d");

        if (
          !snapshot ||
          !context ||
          snapshot.width !== canvas.width ||
          snapshot.height !== canvas.height
        ) {
          return diffCount;
        }

        const current = context.getImageData(0, 0, canvas.width, canvas.height);
        let canvasDiffCount = 0;

        for (let index = 0; index < current.data.length; index += 4) {
          const redDiff = Math.abs(current.data[index] - snapshot.data[index]);
          const greenDiff = Math.abs(
            current.data[index + 1] - snapshot.data[index + 1],
          );
          const blueDiff = Math.abs(
            current.data[index + 2] - snapshot.data[index + 2],
          );
          const alphaDiff = Math.abs(
            current.data[index + 3] - snapshot.data[index + 3],
          );

          if (redDiff + greenDiff + blueDiff + alphaDiff > 20) {
            canvasDiffCount += 1;
          }
        }

        return diffCount + canvasDiffCount;
      },
      0,
    );
  }, name);
}

test("dragging a point creates one undoable change", async ({ page }) => {
  await openEditor(page);

  await storeCanvasSnapshot(page, "before-drag");
  const topLeft = patternPointToScreen({ x: -120, y: -160 });

  await page.mouse.move(topLeft.x, topLeft.y);
  await page.mouse.down();
  await page.mouse.move(topLeft.x + 80, topLeft.y + 80, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  const afterDragDiff = await countCanvasDiff(page, "before-drag");
  expect(afterDragDiff).toBeGreaterThan(500);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(100);

  const afterUndoDiff = await countCanvasDiff(page, "before-drag");
  expect(afterUndoDiff).toBeLessThan(afterDragDiff * 0.1);
});

test("dragging an edge does not consume the next add-point click", async ({
  page,
}) => {
  await openEditor(page);

  const topEdge = patternPointToScreen({ x: 0, y: -160 });

  await page.mouse.move(topEdge.x, topEdge.y);
  await page.mouse.down();
  await page.mouse.move(topEdge.x, topEdge.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);

  await storeCanvasSnapshot(page, "after-edge-drag");

  await page.getByRole("button", { name: "Add point" }).click();
  await page.mouse.click(topEdge.x, topEdge.y + 40);
  await page.waitForTimeout(300);

  expect(await countCanvasDiff(page, "after-edge-drag")).toBeGreaterThan(100);
});

test("copying and pasting a selected piece duplicates it", async ({ page }) => {
  await openEditor(page);

  await storeCanvasSnapshot(page, "before-paste");
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(200);

  expect(await countCanvasDiff(page, "before-paste")).toBeGreaterThan(500);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("deleting a selected piece removes it", async ({ page }) => {
  await openEditor(page);

  await storeCanvasSnapshot(page, "before-delete-piece");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);

  expect(await countCanvasDiff(page, "before-delete-piece")).toBeGreaterThan(
    1000,
  );
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Move" })).toBeHidden();
});

test("double-clicking an edge shows bezier handles", async ({ page }) => {
  await openEditor(page);

  const topEdge = patternPointToScreen({ x: 0, y: -160 });
  const beforeHandles = await countGreenPixels(page);

  await page.getByRole("button", { name: "Curve" }).click();
  await page.mouse.dblclick(topEdge.x, topEdge.y);
  await page.waitForTimeout(200);

  const afterHandles = await countGreenPixels(page);
  expect(afterHandles).toBeGreaterThan(beforeHandles + 20);
});

test("edge curve focus only shows handles for that edge", async ({ page }) => {
  await openEditor(page);

  const topLeft = patternPointToScreen({ x: -120, y: -160 });
  const topEdge = patternPointToScreen({ x: 0, y: -160 });
  const edgeHandle = patternPointToScreen({ x: -40, y: -160 });
  const adjacentHandle = patternPointToScreen({
    x: -126.6667,
    y: -46.6667,
  });

  await page.getByRole("button", { name: "Curve" }).click();
  await page.mouse.dblclick(topEdge.x, topEdge.y);
  await page.waitForTimeout(200);

  expect(await countGreenPixelsNear(page, edgeHandle)).toBeGreaterThan(10);
  expect(await countGreenPixelsNear(page, adjacentHandle)).toBeLessThan(10);

  await page.mouse.click(topLeft.x, topLeft.y);
  await page.waitForTimeout(200);

  expect(await countGreenPixelsNear(page, edgeHandle)).toBeGreaterThan(10);
  expect(await countGreenPixelsNear(page, adjacentHandle)).toBeGreaterThan(10);
});

test("curved edges are selectable away from their original chord", async ({
  page,
}) => {
  await openEditor(page);

  const topEdge = patternPointToScreen({ x: 0, y: -160 });
  const leftOutHandle = patternPointToScreen({ x: -40, y: -160 });
  const movedLeftOutHandle = patternPointToScreen({ x: -40, y: -80 });
  const curvedEdgePoint = patternPointToScreen({ x: 0, y: -130 });

  await page.getByRole("button", { name: "Curve" }).click();
  await page.mouse.dblclick(topEdge.x, topEdge.y);
  await page.waitForTimeout(200);

  await page.mouse.move(leftOutHandle.x, leftOutHandle.y);
  await page.mouse.down();
  await page.mouse.move(movedLeftOutHandle.x, movedLeftOutHandle.y, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Add point" }).click();
  await storeCanvasSnapshot(page, "before-curve-insert");
  await page.mouse.click(curvedEdgePoint.x, curvedEdgePoint.y);
  await page.waitForTimeout(300);

  expect(await countCanvasDiff(page, "before-curve-insert")).toBeGreaterThan(
    100,
  );
});
