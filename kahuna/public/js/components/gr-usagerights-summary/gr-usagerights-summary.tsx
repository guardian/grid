import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useState} from "react";

import "./gr-usagerights-summary.css";
import { grUsagerightsBbc } from "./gr-usagerights-bbc";

export interface usageRightsSummaryInt {
  id: string;
  label: string;
  icon: () => any;
  clause: (image: any) => boolean;
}

//-- can be extended or modified by org--
const usageRightsOptions: usageRightsSummaryInt[] = grUsagerightsBbc;

interface UsageRightsProps {
  images: any;
  categoryCallback: (images:any) => any;
}

export interface UsageRightsWrapperProps {
  props: UsageRightsProps;
}
const UsageRightsSummary: React.FC<UsageRightsWrapperProps> = ({ props }) => {
  const [options, setOptions] = useState(new Array<usageRightsSummaryInt>());
  const [mixed, setMixed] = useState(false);
  const [images, setImages] = useState(props.images);
  const [category, setCategory] = useState("");
  const [agencyStyle, setAgencyStyle] = useState("supplier-PA_AutoIngest");
  const [agencyTitle, setAgencyTitle] = useState("PA_AutoIngest");

  const categoryCallback = props.categoryCallback;

  const handleImageChange = (e: any) => {
    setImages(e.detail.images);
  };

  useEffect(() => {
    window.addEventListener('imageSelectionChange', handleImageChange);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('imageSelectionChange', handleImageChange);
    };

  }, []);

  useEffect(() => {
    let currentUsage: usageRightsSummaryInt[] = [];
    let localMixed = false;
    let imageCount = 0;
    images.forEach((image: any) => {
      imageCount++;
      let imageUsage: usageRightsSummaryInt[] = [];
      usageRightsOptions.forEach(opt => {
        if (opt.clause(image)) {
          imageUsage.push(opt);
        }
      });
      if(imageCount === 1) {
        //-first image processed-
        currentUsage = imageUsage;
      } else {
        //-second and subsequent images-
        if (!localMixed) { // once we have mixed usage rights no need to assess further
          if (imageUsage.length === 0) { // no matches on current image
            localMixed = (currentUsage.length > 0);
          } else {
            if (currentUsage.length === 0) { // previous image had no matches
              localMixed = true;
            } else { // find intersection of matches from this image and previous images
              let currentUsageIds = new Set(currentUsage.map(o => o.id));
              let imageIds = imageUsage.map(o => o.id);
              let intersectIds = imageIds.filter(id => currentUsageIds.has(id));
              if (intersectIds.length === 0) {
                localMixed = true;
              } else {
                currentUsage = currentUsage.filter(opt => intersectIds.includes(opt.id));
              }
            }
          }
        }
      }
    });
    setMixed(localMixed);
    if (!localMixed && currentUsage.length > 0) {
      setOptions(currentUsage);
    } else {
      setOptions([]);
    }

    categoryCallback(images).then((res: any) => {
      setCategory(res);
    });

    //-agency icon details-
    let tempUploadedBy = "";
    let tempClasses = "";
    if (images.length === 1 || images.size ===  1) {
      tempUploadedBy = images[0].data.uploadedBy ? images[0].data.uploadedBy : "";
      let source = images[0].data.metadata.source ? " source-" + images[0].data.metadata.source.replace(" ","-") : "";
      let credit = images[0].data.metadata.credit ?  " credit-" + images[0].data.metadata.credit.replace(" ","-") : "";
      let supplier = images[0].data.uploadedBy ? " supplier-" + images[0].data.uploadedBy.replace(" ","-") : "";
      let agencyIcon = images[0].data.usageRights.category ? " " + images[0].data.usageRights.category.replace(" ","-") + "-icon" : "";
      tempClasses = (supplier + source + credit + agencyIcon).trim();
    }
    setAgencyStyle(tempClasses);
    setAgencyTitle(tempUploadedBy);
  }, [images]);

  return (<div>
    <div className="usage-rights-container">
      <div className="usage-rights-element">{ category || 'None'}</div>
      <div className="usage-rights-element">
        <div className={agencyStyle} title={agencyTitle}></div>
      </div>
    </div>
    {!mixed && (
      <table className="usage-rights-summary-table">
        <tbody>
        {options.map((option) => (
          <tr key={option.id + "-row"}>
            <td className="usage-rights-summary-cell" key={option.id + "-icon"}>
              {option.icon()}
            </td>
            <td className="usage-rights-summary-cell" key={option.id + "-label"}>
              <div>{option.label}</div>
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    )}
  </div>);
}

export const usageRightsSummary = angular.module('gr.usageRightsSummary', [])
  .component('usageRightsSummary', react2angular(UsageRightsSummary, ["props"]));

