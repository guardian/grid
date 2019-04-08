#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

require('es6-promise').polyfill();
require('isomorphic-fetch');
const Unsplash = require('unsplash-js').default;

const DEFAULT_NUMBER_OF_IMAGES = 1;
const numberOfImages = process.argv[2] || DEFAULT_NUMBER_OF_IMAGES;

const RATE_LIMIT_REMAINING = 'x-ratelimit-remaining';
const RATE_LIMIT_EXCEEDED = 'unsplash-rate-limit-hit';

const configFile = path.join(process.env.HOME, '.gu', 'grid-sample-images-config.json');
const fileExists = fs.existsSync(configFile);

if (!fileExists) {
  throw `Config file missing. Please create ${configFile}.`
}

const {unsplash: {accessKey, appSecret}, grid: {apiKey, mediaApi}} = require(configFile);

const unsplash = new Unsplash({
  applicationId: accessKey,
  secret: appSecret
});

async function importImage({url}) {
  const apiRoot = await fetch(mediaApi, {
    method: 'GET',
    headers: { 'X-Gu-Media-Key': apiKey }
  }).then(_ => _.json());

  const loaderUrl = apiRoot.links.find(_ => _.rel === 'loader').href;

  return fetch(`${loaderUrl}/imports?uri=${url}`, {
    method: 'POST',
    headers: { 'X-Gu-Media-Key': apiKey }
  }).then(_ => _.json());
}

async function downloadImages() {
  const randomRequest = await unsplash.photos.getRandomPhoto({count: numberOfImages});

  const { headers } = randomRequest;
  const limitRemaining = headers.get(RATE_LIMIT_REMAINING);

  if (limitRemaining === 0 || limitRemaining < numberOfImages) {
    return [Promise.reject(RATE_LIMIT_EXCEEDED)];
  }

  const photos = await randomRequest.json();

  return Promise.all(photos.map(photo => (
    unsplash.photos.downloadPhoto(photo)
      .then(_ => _.json())
      .then(importImage)
  )));
}

try {
  downloadImages()
    .then(images => {
      console.log(`Uploaded ${images.length} images to Grid`);
      console.log(images);
    })
    .catch(console.error);
} catch (err) {
  console.error(err);
}
