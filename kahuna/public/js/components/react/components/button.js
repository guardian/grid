import React from "react";
import PropTypes from "prop-types";

const Button = ({downloading, onClick}) => (<button
  type="button"
  title="Download images"
  aria-label="Download images"
  disabled={downloading}
  onClick={onClick}>
  {downloading ? 'Downloading...' : 'Download'}
</button>);

export default Button;

Button.propTypes = {
  downloading: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};
