// *** usage rights summary for bbc ***

export interface usageRightsSummary {
  label: string;
  icon: string;
  clause: (image: any) => boolean;
}

//-function defining logic that declare an image as payable
const payableClause = (image: any) : boolean => {
  if(image.data.cost &&
     image.data.cost.toString().toLowerCase() === "pay") {
    return true;
  } else {
    return false;
  }
}

const usableForNewsClause = (image: any) : boolean => {
  if(image.data.usageRights &&
     image.data.usageRights.category &&
     image.data.usageRights.category.toString().toLowerCase() === "agency") {
    return true;
  } else {
    return false;
  }
}

const usableForAllClause = (image: any) : boolean => {
  if(image) {
    return true;
  } else {
    return false;
  }
}

export const grUsagerightsBbc: usageRightsSummary[] = [
  {
    label: "Payable",
    icon: "payable.svg",
    clause: payableClause
  },
  {
    label: "Usable for all",
    icon: "usableForAll.svg",
    clause: usableForAllClause
  },
  {
    label: "Usable for News",
    icon: "usableForNews.svg",
    clause: usableForNewsClause
  }
];
