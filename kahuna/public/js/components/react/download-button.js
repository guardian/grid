import React, {useState} from "react";
import PropTypes from 'prop-types';
import {determineDownloadableContent} from "./downloadable-content-resolver";

export const Button = ({downloading, onClick}) => (<button
  type="button"
  title="Download images"
  aria-label="Download images"
  disabled={downloading}
  onClick={onClick}>
  {downloading ? 'Downloading...' : 'Download'}
</button>);

export const DownloadLink = ({downloadUri}) => (<a
  href={downloadUri}
  rel="noopener noreferrer"
  target="_blank"
  aria-label="Download image">
  Download
</a>);

export const DownloadButton = ({images, imageDownloadsService}) => {

    const {canDownloadCrop, restrictDownload} = window._clientConfig;
    const [downloading, setDownloading] = useState(false);

    const {
      downloadableImagesArray,
      shouldShowDownloadLink,
      shouldShowDownloadButton,
      notAllSelectedImagesDownloadable
    } = determineDownloadableContent(images, restrictDownload, canDownloadCrop);

    const downloadImage = async (downloadKey) => {
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
          setDownloading(false);
        });
      });
    };

    return (
      <span className="download side-padded">
      {shouldShowDownloadLink && <DownloadLink downloadUri={downloadableImagesArray[0].data.downloadUri}/>}
        {shouldShowDownloadButton && <Button downloading={downloading} onClick={() => downloadImage()}/>}
        {notAllSelectedImagesDownloadable > 0 && " danger !"}
        {!(shouldShowDownloadButton || shouldShowDownloadLink) &&
          <span className="download__count">cannot download (sad-face)</span>}
    </span>);
  }
;

DownloadButton.propTypes = {
  images: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  imageDownloadsService: PropTypes.object.isRequired
};

DownloadLink.propTypes = {
  downloadUri: PropTypes.string.isRequired
};

Button.propTypes = {
  downloading: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};
