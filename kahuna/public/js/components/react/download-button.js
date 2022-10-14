import React, {useState} from "react";
import PropTypes from 'prop-types';
import {determineDownloadableContent} from "./downloadable-content-resolver";
import DownloadLink from "./components/download-link";
import Button from "./components/button";

const getDownloadLink = ({ links }) => links.find(({ rel }) => rel === 'download').href;


// gr-downloader .download {
//   display: block;
// }
//
// button .download:hover {
//   color: white;
// }
//
// .download-warning {
//   color: yellow;
//   padding-left: 5px;
//   margin-left: -6px;
// }
//
// gr-icon-label.download-icon-label {
//   padding: 0 5px 0 0;
// }
//
// .download-button {
//   height: 36px;
// }


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
      <span>
      {shouldShowDownloadLink && <DownloadLink downloadUri={getDownloadLink(downloadableImagesArray[0])}/>}
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
