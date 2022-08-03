import {
  createPuppeteerRouter,
  RequestQueue,
  Dataset,
} from "@crawlee/puppeteer";
import { labels } from "./labels.js";
import { allPages, startPage, lastPage } from "./main.js";
import { getRequest } from "./requestGenerator.js";

export const router = createPuppeteerRouter();

const BaseURL = "https://www.homedepot.com/";

router.addHandler(labels.listing, async ({ request, page, log }) => {
  log.info("Handling:", { label: request.label, url: request.url });
  const requestQueue = await RequestQueue.open();

  async function reziseVieport() {
    const bodyWidth = 1440;
    const bodyHeight = 50000;
    await page.setViewport({ width: bodyWidth, height: bodyHeight });
    for (let index = 0; index <= 10; index++) {
      await page.keyboard.press("PageDown");
    }
    await page.keyboard.press("End");
    await page.waitForSelector("#footerTagline", { visible: false });
  }

  async function getPaginationData() {
    const numItemsRange = await page.$eval(
      "div.results-pagination__counts span:nth-of-type(1)",
      (el) => el.textContent
    );
    const totalItems = Number(
      await page.$eval(
        "div.results-pagination__counts span:nth-of-type(2)",
        (el) => el.textContent
      )
    );
    const numItems = Number(numItemsRange?.split("-")[1]);
    return { numItems, totalItems };
  }

  async function getItems() {
    const selector =
      'div.results-wrapped div[data-lg-name*="Product Pod"] div.product-pod__title a';

    const itemRelUrls = await page.$$eval(selector, (urls) =>
      urls.map((url) => url.getAttribute("href"))
    );
    const itemUrls = itemRelUrls.map((relUrl) =>
      new URL(relUrl, BaseURL).toString()
    );
    return itemUrls;
  }

  async function getPagination() {
    const paginationData = await getPaginationData();
    const maxPages = Math.ceil(
      paginationData.totalItems / paginationData.numItems
    );
    const totalPages = generatePages(1, maxPages, paginationData.numItems);
    return totalPages;
  }

  function generatePages(
    minPage: number,
    maxPage: number,
    itemsPerPage: number
  ) {
    let newUrl = new URL(request.url);
    let paginationUrls: string[] = [];
    const paginationParam = "Nao";
    for (let index = minPage - 1; index <= maxPage - 1; index++) {
      const itemNum = index * itemsPerPage;
      newUrl.searchParams.set(paginationParam, itemNum.toString());
      paginationUrls.push(newUrl.toString());
    }
    return paginationUrls;
  }

  async function navigateItemsUrls() {
    const itemsUrls = await getItems();
    for (const url of itemsUrls) {
      const request = getRequest(url);
      await requestQueue.addRequest(request);
    }
  }

  async function navigateAllPaginationUrls() {
    const paginationUrls = await getPagination();
    for (const url of paginationUrls) {
      const request = getRequest(url);
      await requestQueue.addRequest(request);
    }
  }

  async function navigateRangePaginationUrls(minPage: number, maxPage: number) {
    const paginationData = await getPaginationData();
    const paginationUrls = generatePages(
      minPage,
      maxPage,
      paginationData.numItems
    );
    for (const url of paginationUrls) {
      const request = getRequest(url);
      await requestQueue.addRequest(request);
    }
  }

  /*************************************************************************/
  await reziseVieport();
  const isPagination = request.url.includes("Nao=");
  const isSinglePage = startPage === lastPage;
  const isRange = startPage != lastPage;

  switch (true) {
    case isPagination:
      await navigateItemsUrls();
      break;
    case allPages && !isPagination:
      await navigateAllPaginationUrls();
      break;
    case (isSinglePage || isRange) && !isPagination:
      await navigateRangePaginationUrls(startPage, lastPage);
      break;
    default:
      break;
  }
});

router.addHandler(labels.detail, async ({ request, page, log }) => {
  log.info("Handling:", { label: request.label, url: request.url });

  async function getTitle() {
    const title = await page.$eval("span.product-title h1", (el) =>
      el.textContent.trim()
    );
    return title;
  }

  async function getBrand() {
    const brand = await page.$eval("span.product-details__brand--link", (el) =>
      el.textContent.trim()
    );
    return brand;
  }

  /**************************************************************************************/
  const url = request.url;
  const title = await getTitle();
  const brand = await getBrand();

  await Dataset.pushData({
    url,
    title,
    brand,
  });
});
