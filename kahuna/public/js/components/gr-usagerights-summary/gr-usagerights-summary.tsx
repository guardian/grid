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
  images: any[];
  category: string;
}

export interface UsageRightsWrapperProps {
  props: UsageRightsProps;
}
const UsageRightsSummary: React.FC<UsageRightsWrapperProps> = ({ props }) => {
  const [options, setOptions] = useState(new Array<usageRightsSummaryInt>());
  const [mixed, setMixed] = useState(false);
  const [images, setImages] = useState(props.images);
  const [category, setCategory] = useState(props.category);

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
    images.forEach(image => {
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
  }, [images]);

  return (<div>
    { category || 'None'}
    <div className="supplier-PA_AutoIngest source-PA" title="PA_AutoIngest"></div>
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

