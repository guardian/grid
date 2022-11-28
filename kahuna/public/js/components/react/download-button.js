import React, {useState} from "react";
import PropTypes from 'prop-types';
import { determineDownloadableContent } from "./downloadable-content-resolver";
import DownloadLink from "./components/download-link";
import { Button, ToolTip } from "component-lib"

const getDownloadLink = ({links}) => links.find(({rel}) => rel === 'download').href;

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
        {shouldShowDownloadButton && <ToolTip
          showToolTip={!!notAllSelectedImagesDownloadable}
          text="not all selected images are downloadable"
        >
          <Button
            onClick={() => downloadImage()}
            label={`Download${downloading ? 'ing...' : ''}`}
            showWarning={!!notAllSelectedImagesDownloadable}
            isDisabled={downloading}
          />
        </ToolTip>}
        {!(shouldShowDownloadButton || shouldShowDownloadLink) &&
          <span className="download__count">cannot download</span>}
    </span>);
  }
;

DownloadButton.propTypes = {
  images: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  imageDownloadsService: PropTypes.object.isRequired
};
