import { expect, test, type Download, type Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), "浏览器不应出现未捕获的运行时错误").toEqual(
    [],
  );
});

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("下载内容不可读取");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function exportReport(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出报告", exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/^alpha-lab-.+\.json$/);
  return JSON.parse(await readDownload(download));
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [],
    row: string[] = [];
  let value = "",
    quoted = false;
  const source = content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if (char === "\n" && !quoted) {
      row.push(value);
      rows.push([...row]);
      row.length = 0;
      value = "";
    } else value += char;
  }
  expect(quoted, "CSV 引号应闭合").toBe(false);
  if (value || row.length) {
    row.push(value);
    rows.push([...row]);
  }
  return rows;
}

const totalReturn = (page: Page) =>
  page.locator(".metric-card").first().locator(".metric-middle strong");

test("三个策略和三个周期确实重新计算回测结果", async ({ page }) => {
  const returns = new Set<string>();
  for (const name of ["双均线趋势", "动量突破", "均值回归"]) {
    const card = page
      .locator(".strategy-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".context-bar strong")).toHaveText(name);
    returns.add((await totalReturn(page).textContent())!);
  }
  expect(returns.size).toBe(3);
  const periods = new Map<
    string,
    { start: string; count: number; result: number }
  >();
  for (const [label, period, count] of [
    ["1 年", "1y", 252],
    ["3 年", "3y", 756],
    ["5 年", "5y", 1260],
  ] as const) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const report = await exportReport(page);
    expect(report.config.period).toBe(period);
    expect(report.points).toHaveLength(count);
    periods.set(period, {
      start: report.points[0].date,
      count: report.points.length,
      result: report.totalReturn,
    });
  }
  expect(new Set([...periods.values()].map((value) => value.start)).size).toBe(
    3,
  );
  expect(new Set([...periods.values()].map((value) => value.result)).size).toBe(
    3,
  );
});

test("参数校验阻止非法配置，合法参数应用到回测与风控", async ({ page }) => {
  await page.getByRole("button", { name: "编辑参数", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('[name="shortWindow"]').fill("50");
  await expect(dialog.getByRole("alert")).toContainText("短周期必须小于长周期");
  await expect(
    dialog.getByRole("button", { name: "应用并回测" }),
  ).toBeDisabled();
  await dialog.locator('[name="shortWindow"]').fill("8");
  await dialog.locator('[name="initialCapital"]').fill("-1");
  await expect(dialog.getByRole("alert")).toContainText("初始资金必须大于 0");
  await expect(
    dialog.getByRole("button", { name: "应用并回测" }),
  ).toBeDisabled();
  await dialog.locator('[name="initialCapital"]').fill("240000");
  await dialog.locator('[name="feeBps"]').fill("25");
  await dialog.locator('[name="longWindow"]').fill("32");
  const position = dialog.locator('[name="maxPosition"]');
  await position.press("Home");
  for (let index = 0; index < 8; index++) await position.press("ArrowRight");
  const stopLoss = dialog.locator('[name="stopLoss"]');
  await stopLoss.press("Home");
  for (let index = 0; index < 10; index++) await stopLoss.press("ArrowRight");
  await expect(
    dialog.getByRole("button", { name: "应用并回测" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "应用并回测" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".context-bar")).toContainText("8 / 32 日窗口");
  await expect(page.locator(".chart-panel .section-heading")).toContainText(
    "初始资金 ¥240,000",
  );
  const report = await exportReport(page);
  expect(report.config).toMatchObject({
    initialCapital: 240000,
    feeBps: 25,
    shortWindow: 8,
    longWindow: 32,
    maxPosition: 0.5,
    stopLoss: 0.12,
  });
  await page.getByRole("button", { name: "组合与风控", exact: true }).click();
  await expect(page.locator(".risk-rule").nth(0)).toContainText("50.00%");
  await expect(page.locator(".risk-rule").nth(1)).toContainText("12.00%");
  await expect(page.locator(".risk-rule").nth(2)).toContainText("25 bp");
});

test("保存、刷新、恢复和删除策略保留正确的参数", async ({ page }) => {
  await page
    .locator(".strategy-card")
    .filter({
      has: page.getByRole("heading", { name: "动量突破", exact: true }),
    })
    .click();
  await expect(page.locator(".context-bar strong")).toHaveText("动量突破");
  await page.getByRole("button", { name: "编辑参数", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator('[name="initialCapital"]')
    .fill("350000");
  await page.getByRole("button", { name: "应用并回测", exact: true }).click();
  await expect(page.locator(".chart-panel .section-heading")).toContainText(
    "¥350,000",
  );
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await page.getByRole("button", { name: "策略实验室", exact: false }).click();
  await expect(page.locator(".saved-item")).toHaveCount(1);
  await expect(page.locator(".saved-item")).toContainText(
    "动量突破 · 15/50 日 · ¥350,000",
  );
  await page.reload();
  await page.getByRole("button", { name: "策略实验室", exact: false }).click();
  await expect(page.locator(".saved-item")).toHaveCount(1);
  await page
    .locator(".strategy-card")
    .filter({
      has: page.getByRole("heading", { name: "均值回归", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "继续研究", exact: false }).click();
  await expect(page.locator(".context-bar strong")).toHaveText("动量突破");
  await expect(page.locator(".chart-panel .section-heading")).toContainText(
    "¥350,000",
  );
  await page.getByRole("button", { name: "策略实验室", exact: false }).click();
  await page.getByRole("button", { name: /^删除 / }).click();
  await expect(page.locator(".saved-item")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "策略实验室", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "留住你的第一个策略" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("alpha-lab.saved-strategies.v1") || "[]"),
    ),
  ).toEqual([]);
});

test("JSON 和 CSV 下载可解析、标明模拟数据，资金分布与报告一致", async ({
  page,
}) => {
  const report = await exportReport(page);
  expect(report.application).toBe("Alpha Lab");
  expect(report.dataSource).toContain("模拟");
  expect(report.sampleLabel).toContain("模拟");
  expect(Number.isFinite(report.finalEquity)).toBe(true);
  expect(report.cash + report.positionValue).toBeCloseTo(report.finalEquity, 6);
  expect(report.trades.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "组合与风控", exact: true }).click();
  const precise = (number: number) =>
    new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  const rounded = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(report.finalEquity);
  await expect(page.locator(".allocation-ring strong")).toHaveText(
    `¥${rounded}`,
  );
  await expect(
    page.locator(".allocation-details > div").nth(0).locator("strong"),
  ).toHaveText(`¥${precise(report.positionValue)}`);
  await expect(
    page.locator(".allocation-details > div").nth(1).locator("strong"),
  ).toHaveText(`¥${precise(report.cash)}`);
  await page.getByRole("button", { name: "交易记录", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("alpha-lab-trend-3y.csv");
  const rows = parseCsv(await readDownload(download));
  expect(rows[0]).toEqual([
    "日期",
    "方向",
    "标的",
    "价格",
    "数量",
    "手续费",
    "触发原因",
    "已实现盈亏",
  ]);
  expect(rows).toHaveLength(report.trades.length + 1);
  rows.slice(1).forEach((row, index) => {
    expect(row).toHaveLength(8);
    expect(row[2]).toBe("模拟资产");
    expect(row[0]).toBe(report.trades[index].date);
    expect(Number(row[3])).toBeCloseTo(report.trades[index].price, 2);
    expect(Number(row[4])).toBe(report.trades[index].quantity);
    expect(row[6]).toBe(report.trades[index].reason);
  });
});

test("搜索支持页面和策略导航，Escape 关闭弹窗", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "搜索页面或策略" }).fill("风控");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "组合与风控" })
    .click();
  await expect(
    page.getByRole("heading", { name: "当前资金分布" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "搜索策略", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索页面或策略" }).fill("动量");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "动量突破策略模板" })
    .click();
  await expect(page.locator(".context-bar strong")).toHaveText("动量突破");
  await page.getByRole("button", { name: "搜索策略", exact: true }).click();
  await page
    .getByRole("textbox", { name: "搜索页面或策略" })
    .fill("不存在的模板");
  await expect(page.getByRole("dialog")).toContainText("没有找到匹配内容");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "搜索策略", exact: true }),
  ).toBeFocused();
});

test("390px 移动布局支持导航和参数操作，无页面横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertNoOverflow = async () => {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  };
  await assertNoOverflow();
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await page.getByRole("button", { name: "组合与风控", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "当前资金分布" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
  await assertNoOverflow();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "交易记录", exact: true }).click();
  await expect(page.getByRole("button", { name: "导出 CSV" })).toBeVisible();
  await assertNoOverflow();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "研究总览", exact: true }).click();
  await page.getByRole("button", { name: "编辑参数", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await assertNoOverflow();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await assertNoOverflow();
});
