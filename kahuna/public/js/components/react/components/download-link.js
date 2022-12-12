import PropTypes from "prop-types";
import React from "react";

const DownloadLink = ({downloadUri}) => (<a
  href={downloadUri}
  rel="noopener noreferrer"
  target="_blank"
  aria-label="Download image">
  Download
</a>);

export default DownloadLink;

DownloadLink.propTypes = {
  downloadUri: PropTypes.string.isRequired
};
