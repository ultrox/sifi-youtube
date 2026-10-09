const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/settings-model.js'), 'utf8'), context);
const model = context.SifiYouTubeSettings;

test('new installs enable all features and stored false survives normalization', () => {
  assert.equal(model.normalize().shortsLock, true);
  const saved = model.normalize({ shortsLock: false, subscriptionsHome: false, channelVideos: false });
  for (const key of ['shortsLock', 'subscriptionsHome', 'channelVideos']) assert.equal(saved[key], false);
  assert.equal(model.normalize({ shortsLock: 'false' }).shortsLock, true);
});

test('default only bare Home and channel entry routes, preserving explicit tabs and videos', () => {
  const settings = model.normalize();
  assert.equal(model.destination('/', settings), '/feed/subscriptions');
  for (const route of ['/@creator', '/channel/UC123', '/c/creator', '/user/creator']) {
    assert.equal(model.destination(route, settings), route + '/videos');
    assert.equal(model.destination(route + '/', settings), route + '/videos');
    for (const tab of ['videos', 'shorts', 'featured', 'playlists', 'streams']) {
      assert.equal(model.destination(route + '/' + tab, settings), null);
    }
  }
  for (const route of ['/watch', '/shorts/abc', '/feed/subscriptions', '/results']) {
    assert.equal(model.destination(route, settings), null);
  }
});

test('disabled navigation settings do not request redirects', () => {
  const settings = model.normalize({ subscriptionsHome: false, channelVideos: false });
  assert.equal(model.destination('/', settings), null);
  assert.equal(model.destination('/@creator', settings), null);
});

test('pagination migrates existing settings with a six-page default and saves independent toggles', () => {
  const migrated = model.normalize({ shortsLock: false });
  assert.equal(migrated.shortsLock, false);
  assert.equal(migrated.homePagination, true);
  assert.equal(migrated.subscriptionsPagination, true);
  assert.equal(migrated.recommendationsPagination, true);
  assert.equal(migrated.pageLimit, 6);
  const updated = model.normalize({ homePagination: false, pageLimit: 8 });
  assert.equal(updated.homePagination, false); assert.equal(updated.pageLimit, 8);
  assert.equal(model.normalize({ pageLimit: 300 }).pageLimit, 30);
  assert.equal(model.normalize({ pageLimit: 3.5 }).pageLimit, 6);
});
