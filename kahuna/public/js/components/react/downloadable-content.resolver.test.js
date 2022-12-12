import {determineDownloadableContent} from "./downloadable-content-resolver";

const getMockImage = (links = [], title = 'default') => ([
    {
      title,
      data: {
        softDeletedMetadata: undefined
      },
      links
    }
  ]);

const mockDownloadLink = { rel : 'download' };

describe('downloadable-content-resolver restrictDownload enabled', () => {
  const restrictDownload = true;

  test('should accept Map as images input', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(new Map()
      .set('foo', getMockImage([mockDownloadLink])), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(shouldShowDownloadLink).toBe(true);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });

  test('should not allow download where download url absent from links on single image', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(getMockImage(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(0);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should not allow download where download url absent from links on multiple images', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage(),getMockImage()].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(0);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a link where a single downloadable image is present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(getMockImage([mockDownloadLink]), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(shouldShowDownloadLink).toBe(true);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a button where a multiple downloadable images are present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage([mockDownloadLink]), getMockImage([mockDownloadLink])].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(2);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a button where downloadable & non-downloadable images are present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage(), getMockImage([mockDownloadLink])].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(true);
  });
  test('should filter non-downloadable images from the downloadable images array', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage([], "excludeMe"), getMockImage([mockDownloadLink],"includeMe")].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(downloadableImagesArray[0].title).toBe("includeMe");
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(true);
  });
});

describe('downloadable-content-resolver restrictDownload disabled', () => {
  const restrictDownload = false;
  test('should allow download where download url absent from links on single image', () => {

    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(getMockImage(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(shouldShowDownloadLink).toBe(true);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should allow download where download url absent from links on multiple images', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage(),getMockImage()].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(2);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a link where a single downloadable image is present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(getMockImage([mockDownloadLink]), restrictDownload);

    expect(downloadableImagesArray.length).toBe(1);
    expect(shouldShowDownloadLink).toBe(true);
    expect(shouldShowDownloadButton).toBe(false);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a button where a multiple downloadable images are present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage([mockDownloadLink]), getMockImage([mockDownloadLink])].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(2);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should return true for a button where downloadable & non-downloadable images are present', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage(), getMockImage([mockDownloadLink])].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(2);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
  test('should not filter non-downloadable images from the downloadable images array where download links are absent', () => {
    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent([getMockImage([]), getMockImage([mockDownloadLink],"includeMe")].flat(), restrictDownload);

    expect(downloadableImagesArray.length).toBe(2);
    expect(shouldShowDownloadLink).toBe(false);
    expect(shouldShowDownloadButton).toBe(true);
    expect(notAllSelectedImagesDownloadable).toBe(false);
  });
});
