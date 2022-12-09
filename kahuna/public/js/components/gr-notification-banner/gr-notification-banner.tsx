
import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

const Button = require("@bbc/igm-btn");
const GELicon = require("@bbc/igm-gel-icon");
const Notification = require("@bbc/igm-notification");

import "@bbc/igm-notification/dist/Notification.css";
import "./gr-notification-banner.css";


interface Props{
    message: string;
}


const NotificationBanner = ({message}: Props) => {

    const [hidden, setHidden] = useState(false);
    const messageIcon = { set: "legacy", name: "yes" };
    const close = () => {
      setHidden(true);
    };

  return (
    <div id="notification" className="notification">
      <Notification
      className="notification"
        type="warning"
        id="notification"
        buttons={[
          <Button
            key="close-btn"
            gelIconName="close"
            type="floating"
            size="small"
            onClick={close}
          />,
        ]}
        icon={<GELicon set={messageIcon.set} name={messageIcon.name} />}
        hidden={hidden}
        message={message}
      />
    </div>
  );
};



export const notificationBanner = angular.module('gr.notificationBanner', [])
  .component('notificationBanner', react2angular(NotificationBanner, ["message"]));

