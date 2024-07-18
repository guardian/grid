// *** usage rights summary for bbc ***
import * as React from "react";
import { usageRightsSummaryInt } from "./gr-usagerights-summary";

const payableSvg = () =>
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{paddingTop:"6px"}}>
    <circle cx="9" cy="9" r="8" fill="white" />
    <g clipPath="url(#clip0_268_2061)">
      <path d="M9 17.4375C13.7812 17.4375 17.4375 13.7812 17.4375 9C17.4375 4.21875 13.7812 0.5625 9 0.5625C4.21875 0.5625 0.5625 4.21875 0.5625 9C0.5625 13.7812 4.21875 17.4375 9 17.4375ZM12.7125 11.4187V13.275H5.0625V11.7C5.90625 11.4187 6.35625 10.8562 6.35625 10.0687C6.35625 9.7875 6.35625 9.5625 6.24375 9.3375H4.8375V8.04375H5.9625C5.85 7.70625 5.7375 7.3125 5.7375 6.80625C5.7375 5.00625 7.2 3.9375 9.5625 3.9375C10.575 3.9375 11.5312 4.10625 12.375 4.55625V6.525C11.6438 6.075 10.8 5.85 9.95625 5.85C8.6625 5.85 8.04375 6.35625 8.04375 7.2C8.04375 7.5375 8.1 7.81875 8.15625 8.04375H10.9125V9.3375H8.49375C8.49375 9.50625 8.55 9.675 8.55 9.7875C8.55 10.4625 8.26875 11.025 7.70625 11.3625H12.7125V11.4187Z" fill="#E51854"/>
    </g>
  </svg>;

const usableForNewsIcon = () =>
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" style={{paddingTop:"6px"}}>
    <circle cx="8.5" cy="8.5" r="8.5" fill="#FFB32B"/>
    <path d="M9.36213 14.0001H7.32594C7.30947 14.0001 7.2945 13.9935 7.28372 13.9825C7.27294 13.9715 7.26605 13.9569 7.26605 13.9405V10.4818C7.26605 10.4654 7.27264 10.4504 7.28372 10.4397C7.2948 10.429 7.30947 10.4221 7.32594 10.4221H9.36213C9.3786 10.4221 9.39357 10.4287 9.40435 10.4397C9.41513 10.4507 9.42202 10.4654 9.42202 10.4818V13.9405C9.42202 13.9569 9.41543 13.9718 9.40435 13.9825C9.39327 13.9932 9.3786 14.0001 9.36213 14.0001Z" fill="#333333"/>
    <path d="M12.9403 9.73395H7.32578C7.30936 9.73395 7.29442 9.72738 7.28367 9.71633C7.27292 9.70528 7.26605 9.69064 7.26605 9.67422V4.05973C7.26605 4.0433 7.27262 4.02837 7.28367 4.01762C7.29472 4.00687 7.30936 4 7.32578 4H12.9403C12.9567 4 12.9716 4.00657 12.9824 4.01762C12.9931 4.02867 13 4.0433 13 4.05973V9.67422C13 9.69064 12.9934 9.70558 12.9824 9.71633C12.9713 9.72708 12.9567 9.73395 12.9403 9.73395Z" fill="#333333"/>
    <path d="M6.51835 11.1559H3.05963C3.04323 11.1559 3.02833 11.1493 3.01759 11.1383C3.00686 11.1272 3 11.1126 3 11.0962V7.63751C3 7.62111 3.00656 7.60621 3.01759 7.59547C3.02862 7.58474 3.04323 7.57788 3.05963 7.57788H6.51835C6.53475 7.57788 6.54966 7.58444 6.56039 7.59547C6.57113 7.6065 6.57798 7.62111 6.57798 7.63751V11.0962C6.57798 11.1126 6.57142 11.1275 6.56039 11.1383C6.54936 11.149 6.53475 11.1559 6.51835 11.1559Z" fill="#333333"/>
  </svg>;

const usableForAllIcon = () =>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{paddingTop:"6px"}}>
    <circle cx="8" cy="8" r="8" fill="#32BEA6"/>
    <rect x="2" y="7.4165" width="2.16008" height="7.44672" transform="rotate(-45 2 7.4165)" fill="white"/>
    <rect x="12.9" y="4" width="2.16" height="8.25326" transform="rotate(45 12.9 4)" fill="white"/>
  </svg>;

const payableClause = (image: any) : boolean => {
  return (image.data.cost &&
          image.data.cost.toString().toLowerCase() === "pay");
};

const usableForNewsClause = (image: any) : boolean => {
  const isAgency =  (image.data.usageRights &&
          image.data.usageRights.category &&
          image.data.usageRights.category.toString().toLowerCase() === "agency");
  const isPayable = (image.data.cost &&
          image.data.cost.toString().toLowerCase() === "pay");
  return (isAgency && !isPayable);
};

const usableForAllClause = (image: any) : boolean => {
  let hasRestrictions = false;
  if (image.data.cost &&
     (image.data.cost.toString().toLowerCase() === "pay" ||
      image.data.cost.toString().toLowerCase() === "conditional")) {
    hasRestrictions = true;
  }
  if (image.data.usageRights &&
      image.data.usageRights.usageRestrictions) {
    hasRestrictions = true;
  }
  let bbcOwned = false;
  if (image.data.metadata.credit &&
      image.data.metadata.credit.toString().toLowerCase().includes("bbc")) {
    bbcOwned = true;
  }
  if (image.data.usageRights &&
      image.data.usageRights.credit &&
      image.data.usageRights.credit.toString().toLowerCase().includes("bbc")) {
    bbcOwned = true;
  }
  if (image.data.usageRights &&
    image.data.usageRights.publication &&
    image.data.usageRights.publication.toString().toLowerCase().includes("bbc")) {
    bbcOwned = true;
  }

  return (bbcOwned && !hasRestrictions);
};

export const grUsagerightsBbc: usageRightsSummaryInt[] = [
  {
    id: "payable",
    label: "Payable images",
    icon: payableSvg,
    clause: payableClause
  },
  {
    id: "usableforall",
    label: "Usable for all",
    icon: usableForAllIcon,
    clause: usableForAllClause
  },
  {
    id: "usablefornews",
    label: "Usable for News",
    icon: usableForNewsIcon,
    clause: usableForNewsClause
  }
];
