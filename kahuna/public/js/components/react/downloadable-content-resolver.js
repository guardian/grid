export const determineDownloadableContent = (images, restrictDownload) => {

  const imageArray = Array.isArray(images) ? images : Array.from(images.values()).flat(); // TODO - have flattened this - identify what the expected input is, assuming Map
  const imageCount = imageArray.length;

  const downloadableImagesArray = restrictDownload ?
    imageArray.filter(({data, links}) =>
      links?.some(({rel}) => rel === 'download') && data.softDeletedMetadata === undefined) :
    imageArray;

  const selectedNonDownloadableImages = restrictDownload ?
    imageArray.filter(({data, links}) =>
      !links?.some(({rel}) => rel === 'download') || data.softDeletedMetadata !== undefined) :
    [];

  const totalSelectedImages = imageCount;
  const singleImageSelected = imageCount === 1;
  const multipleImagesSelected = totalSelectedImages > 1;

  const multipleSelectedAllDownloadable = multipleImagesSelected && selectedNonDownloadableImages.length < 1;
  const multipleSelectedNoneDownloadable = multipleImagesSelected && totalSelectedImages === selectedNonDownloadableImages.length;
  const notAllSelectedImagesDownloadable = multipleImagesSelected && !(multipleSelectedNoneDownloadable || multipleSelectedAllDownloadable);


  const shouldShowDownloadButton = multipleSelectedAllDownloadable || notAllSelectedImagesDownloadable;
  const shouldShowDownloadLink = (singleImageSelected && selectedNonDownloadableImages.length === 0);


  return {
    downloadableImagesArray,
    shouldShowDownloadLink,
    shouldShowDownloadButton,
    notAllSelectedImagesDownloadable
  };
};
