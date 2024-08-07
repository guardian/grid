import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import {useEffect, useState} from "react";
import * as moment from 'moment';
import "./gr-image-usage-photosales.css";

export interface Usage {
  title: string,
  usageName: string,
  usageType: string,
  dateAdded: Date
}

export interface UsageProps {
  usages: Usage[];
}

export interface UsagePropsWrapper {
  props: UsageProps;
}

const ImageUsagePhotoSales: React.FC<UsagePropsWrapper> = ({ props }) => {
  const [usages, setUsages] = useState(props.usages);
  const [extractedPhotoSalesUsage, setPhotoSalesUsage] = useState<Usage|null>(null);

  const photoSalesIdentifier = "sendToPhotoSales";

  const formatTimestamp = (timestamp: Date) => {
    return moment(timestamp).fromNow();
  };

  useEffect(()=> {
    const photoSalesUsage = usages.find(usage => usage.usageType === photoSalesIdentifier);
    if (photoSalesUsage) {
      setPhotoSalesUsage(photoSalesUsage);
      setUsages(usages.filter(usage => usage.usageType !== photoSalesIdentifier));
    } else {
      setPhotoSalesUsage(null);
    }
  }, []);

  return (
    <div>
      {extractedPhotoSalesUsage && (
        <div className="image-info__group">
          <span className="usageNameStyle">
            {extractedPhotoSalesUsage.usageName}
          </span>
          <ul>
            <li className="usageRecordStyle">

              {extractedPhotoSalesUsage.title}

              <div className="usageMoreInfoStyle">
                <span className="usageDateAddedStyle">{formatTimestamp(extractedPhotoSalesUsage.dateAdded)}</span>
              </div>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export const imageUsagePhotoSales = angular.module('gr.imageUsagePhotoSales', [])
  .component('imageUsagePhotoSales', react2angular(ImageUsagePhotoSales, ["props"]));
