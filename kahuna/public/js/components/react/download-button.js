import React, {useState} from "react";
import PropTypes from 'prop-types';

const Button = ({downloading, onClick}) => (<button
  type="button"
  title="Download images"
  aria-label="Download images"
  disabled={downloading}
  onClick={onClick}>
  {downloading ? 'Downloading...' : 'Download'}
</button>);

const DownloadLink = ({downloadUri}) => (<a
  href={downloadUri}
  rel="noopener"
  target="_blank"
  aria-label="Download image">
  Download
</a>);


export const DownloadButton = ({images, imageDownloadsService}) => {
  const {canDownloadCrop, restrictDownload} = window._clientConfig;
  const [downloading, setDownloading] = useState(false);

  const imageArray = Array.isArray(images) ? images : Array.from(images.values());
  const imageCount = imageArray.length;

  const downloadableImagesArray = restrictDownload ? imageArray.filter(({data}) => data.userCanEdit && data.softDeletedMetadata === undefined) : imageArray;
  const selectedNonDownloadableImages = imageArray.filter(({data}) => !data.userCanEdit || !data.softDeletedMetadata === undefined) || [];

  const totalSelectedImages = imageCount;
  const singleImageSelected = imageCount === 1;

  const multipleSelectedAllDownloadable = imageCount > 1 && selectedNonDownloadableImages.length < 1;
  const multipleSelectedSomeDownloadable = imageCount > 1 && !multipleSelectedAllDownloadable;
  const multipleSelectedNoneDownloadable = imageCount > 1 && totalSelectedImages === selectedNonDownloadableImages.length;


  // TODO move this somewhere else
  const downloadImage = async (downloadKey) => {
    try {
      setDownloading(true);
      const dl = imageDownloadsService.download$(downloadableImagesArray, downloadKey || 'downloadUri');
      dl.subscribe((zip) => {
        zip.generateAsync({type: 'uint8array'}).then(file => {
          const blob = new Blob([file], {type: 'application/zip'});
          const createDownload = () => {
            const url = window.URL.createObjectURL(blob);
            window.location = url;
            window.URL.revokeObjectURL(url);
          };
          createDownload();
        });
      });
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  }

  const shouldShowDownloadButton = multipleSelectedAllDownloadable || multipleSelectedSomeDownloadable;
  const shouldShowDownloadLink = (singleImageSelected && selectedNonDownloadableImages.length === 0) || multipleSelectedNoneDownloadable;

  return (
    <span className="download side-padded">
      {shouldShowDownloadLink && <DownloadLink downloadUri={downloadableImagesArray[0].data.downloadUri}/>}
      {shouldShowDownloadButton && <Button downloading={downloading} onClick={() => downloadImage()}/>}
      {multipleSelectedSomeDownloadable > 0 && "danger"}
      {!(shouldShowDownloadButton || shouldShowDownloadLink) && <span className="download__count">cannot download (sad-face)</span>}
    </span>);
}

DownloadButton.propTypes = {
  images: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  imageDownloadsService: PropTypes.object.isRequired
};
