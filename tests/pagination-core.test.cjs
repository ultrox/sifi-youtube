const { test } = require('node:test');
const assert = require('node:assert/strict');
const pages = require('../extension/pagination-core.js');
const settings = { homePagination: true, subscriptionsPagination: true, recommendationsPagination: true };

test('pagination targets only the requested mobile surfaces, not comments, Shorts or channel tabs', () => {
  const scope = path => pages.scope(new URL(`https://m.youtube.com${path}`), settings);
  assert.equal(scope('/').kind, 'home');
  assert.equal(scope('/feed/subscriptions').kind, 'subscriptions');
  assert.equal(scope('/watch?v=abc&t=30').key, 'watch:abc');
  for (const path of ['/shorts/abc', '/@creator', '/@creator/videos', '/feed/library', '/results', '/watch']) assert.equal(scope(path), null);
  assert.equal(pages.scope(new URL('https://www.youtube.com/'), settings), null);
  assert.equal(pages.scope(new URL('https://m.youtube.com/'), { ...settings, homePagination: false }), null);
});

test('default is six pages; configurable page counts are bounded and validated', () => {
  assert.equal(pages.limit(undefined), 6);
  assert.equal(pages.limit(8), 8);
  assert.equal(pages.limit(0), 1);
  assert.equal(pages.limit(1000), 30);
  assert.equal(pages.limit(1.5), 6);
  assert.equal(pages.limit('8'), 6);
});

test('exactly ten cached items belong to each page, regardless of native batch size', () => {
  for (let page = 1; page <= 6; page++) {
    const view = pages.view(72, page, 6, true);
    assert.equal(view.end - view.start, 10);
    assert.equal(view.start, (page - 1) * 10);
    assert.equal(view.total, 60);
    assert.equal(view.next, page < 6);
    assert.equal(view.previous, page > 1);
  }
  assert.equal(pages.view(72, 6, 6, true).atLimit, true);
});

test('short feeds and partial last pages stop without inventing empty pages', () => {
  const short = pages.view(7, 1, 6, false);
  assert.equal(short.end, 7); assert.equal(short.pages, 1); assert.equal(short.next, false);
  const partial = pages.view(23, 6, 6, false);
  assert.equal(partial.page, 3); assert.equal(partial.end - partial.start, 3);
  assert.equal(partial.next, false); assert.equal(partial.atLimit, false);
  assert.equal(pages.view(0, 1, 6, false).next, false);
});

test('a remaining native continuation enables explicit Next but cannot bypass the cap', () => {
  assert.equal(pages.view(10, 1, 6, true).next, true);
  assert.equal(pages.view(10, 1, 6, false).next, false);
  assert.equal(pages.view(60, 6, 6, true).next, false);
  assert.equal(pages.view(60, 6, 8, true).next, true);
});

test('thumb-sized numbered navigation stays compact when the limit increases', () => {
  assert.deepEqual(pages.numbers(1, 6), [1, 2, 3, 4, 5, 6]);
  for (let page = 1; page <= 30; page++) {
    const numbers = pages.numbers(page, 30);
    assert.ok(numbers.length <= 7);
    assert.equal(numbers[0], 1); assert.equal(numbers.at(-1), 30);
    assert.ok(numbers.includes(page));
    assert.ok(numbers.every(value => value === '…' || (value >= 1 && value <= 30)));
  }
});

test('independent page sizes default to five recommendations and ten feed items', () => {
  assert.equal(pages.pageSize('recommendations', {}), 5);
  assert.equal(pages.pageSize('home', {}), 10);
  assert.equal(pages.pageSize('subscriptions', {}), 10);
  assert.equal(pages.pageSize('recommendations', {recommendationsPageSize: 8}), 8);
  for (const size of [1, 5, 8, 30]) {
    const last = pages.view(200, 6, 6, true, size);
    assert.equal(last.start, 5 * size);
    assert.equal(last.end, 6 * size);
    assert.equal(last.next, false);
    const partial = pages.view(size + 1, 2, 6, false, size);
    assert.equal(partial.end - partial.start, 1);
  }
});

test('page delay defaults to 900ms and cannot be configured below 500ms', () => {
  assert.equal(pages.delay(undefined), 900);
  for (const value of [-500, 0, 499]) assert.equal(pages.delay(value), 500);
  assert.equal(pages.delay(1500), 1500);
  assert.equal(pages.delay(20000), 10000);
  for (const value of [NaN, Infinity, '0', 1.5]) assert.equal(pages.delay(value), 900);
});
