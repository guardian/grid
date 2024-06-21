/* ********************************************
The restrictions text that should be displayed
to accompany the image that comprises the
restrictions stored on the image and any
added by virtue of the rights category
*********************************************** */
const restrictionsText = (image) => {
    let restrictText = "";
    if (!image.data.usageRights) {
      return restrictText;
    }
    if (image.data.usageRights.usageRestrictions) {
      restrictText = image.data.usageRights.usageRestrictions;
    }
    restrictText = restrictText.trim();
    if (restrictText.length > 0 && restrictText[restrictText.length - 1] != ".") {
      restrictText = restrictText + ". ";
    } else {
      restrictText = restrictText + " ";
    }
    if (image.data.usageRights.restrictions) {
      restrictText = restrictText + image.data.usageRights.restrictions;
    }
    return restrictText;
}

export { restrictionsText };
