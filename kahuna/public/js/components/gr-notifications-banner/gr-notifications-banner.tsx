import * as React from "react";
import * as angular from "angular";
import {react2angular} from "react2angular";
import {useEffect, useState} from "react";

import "./gr-notifications-banner.css";

const NOTIFICATION_LABEL = "Acknowledge and Close Notification";
const DEFAULT_URL_TEXT = "Click here for further information";
const PERSISTENT = "persistent";
const TRANSIENT = "transient";
const NOTIFICATION_COOKIE = "notification_cookie";
const cookie_age = 31536000;
const checkNotificationsUri = window._clientConfig.rootUri + "/notifications";
const checkNotificationsInterval = 600000; // in ms

const tickIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polyline fill="none" stroke="inherit" points="3.7 14.3 9.6 19 20.3 5" strokeLinecap="round" strokeLinejoin="round"
              strokeWidth="2"/>
  </svg>;

const emptyIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="100%" height="100%" fill="none" stroke="none"/>
  </svg>;

const triangleIcon = () =>
  <svg width="24px" height="24px" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <g id="Page-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
      <g id="add" fill="#000000" transform="translate(32.000000, 42.666667)">
        <path
          d="M246.312928,5.62892705 C252.927596,9.40873724 258.409564,14.8907053 262.189374,21.5053731 L444.667042,340.84129 C456.358134,361.300701 449.250007,387.363834 428.790595,399.054926 C422.34376,402.738832 415.04715,404.676552 407.622001,404.676552 L42.6666667,404.676552 C19.1025173,404.676552 7.10542736e-15,385.574034 7.10542736e-15,362.009885 C7.10542736e-15,354.584736 1.93772021,347.288125 5.62162594,340.84129 L188.099293,21.5053731 C199.790385,1.04596203 225.853517,-6.06216498 246.312928,5.62892705 Z M224,272 C208.761905,272 197.333333,283.264 197.333333,298.282667 C197.333333,313.984 208.415584,325.248 224,325.248 C239.238095,325.248 250.666667,313.984 250.666667,298.624 C250.666667,283.264 239.238095,272 224,272 Z M245.333333,106.666667 L202.666667,106.666667 L202.666667,234.666667 L245.333333,234.666667 L245.333333,106.666667 Z"
          id="Combined-Shape">
        </path>
      </g>
    </g>
  </svg>;

const crossIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="none" stroke="none"/>
    <path d="M7 17L16.8995 7.10051" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    <path d="M7 7.00001L16.8995 16.8995" stroke="#000" strokeLinecap="round" strokeLinejoin="round"
          strokeWidth="2"/>
  </svg>;

const circleIcon = () =>
  <svg width="24px" height="24px" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <g id="Page-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
      <g id="add" fill="#000000" transform="translate(42.666667, 42.666667)">
        <path
          d="M213.333333,3.55271368e-14 C95.51296,3.55271368e-14 3.55271368e-14,95.51168 3.55271368e-14,213.333333 C3.55271368e-14,331.153707 95.51296,426.666667 213.333333,426.666667 C331.154987,426.666667 426.666667,331.153707 426.666667,213.333333 C426.666667,95.51168 331.154987,3.55271368e-14 213.333333,3.55271368e-14 Z M240.04672,128 C240.04672,143.46752 228.785067,154.666667 213.55008,154.666667 C197.698773,154.666667 186.713387,143.46752 186.713387,127.704107 C186.713387,112.5536 197.99616,101.333333 213.55008,101.333333 C228.785067,101.333333 240.04672,112.5536 240.04672,128 Z M192.04672,192 L234.713387,192 L234.713387,320 L192.04672,320 L192.04672,192 Z"
          id="Shape">
        </path>
      </g>
    </g>
  </svg>;

export interface Notification {
  announceId: string,
  description: string,
  endDate: string,
  url: string,
  urlText: string,
  category: string,
  lifespan: string
}

const todayStr = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const mthStr = (month < 10) ? `0${month}` : `${month}`;
  const dayStr = (day < 10) ? `0${day}` : `${day}`;
  return (`${year}-${mthStr}-${dayStr}`);
};

const getCookie = (cookieName: string): string => {
  const decodedCookie = decodeURIComponent(document.cookie);
  const cookieArray = decodedCookie.split(';');
  const temp = cookieArray.find((cookie) => cookie.trim().startsWith(cookieName));
  if (temp) {
    return temp.trim().replace((cookieName + "="), "");
  }
  return null;
};

const mergeArraysByKey = (array1: Notification[], array2: Notification[], key: keyof Notification): Notification[] => {
  const merged = new Map<string, Notification>();
  const addOrUpdate = (item: Notification) => {
    merged.set(item[key], item);
  };

  array1.forEach(addOrUpdate);
  array2.forEach(addOrUpdate);
  return Array.from(merged.values());
};

const getIcon = (notification: Notification): JSX.Element => {
  switch (notification.category) {
    case "success":
      return tickIcon();
    case "error":
    case "warning":
    case "information":
      return triangleIcon();
    case "announcement":
      return circleIcon();
    default:
      return emptyIcon();
  }
};

const NotificationsBanner: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const autoHideListener = (event: any) => {
    if (event.type === "keydown" && event.key === "Escape") {
      setNotifications(prevNotifs => prevNotifs.filter(n => n.lifespan !== TRANSIENT));
    } else if (event.type !== "keydown") {
      if (event.target.className !== "notification-url") {
        setNotifications(prevNotifs => prevNotifs.filter(n => n.lifespan !== TRANSIENT));
      }
    }
  };

  const checkNotifications = () => {
    fetch(checkNotificationsUri)
      .then(response => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        return response.json();
      })
      .then(data => {
        const announce: Notification[] = data;
        const tdy = todayStr();
        let notif_cookie = getCookie(NOTIFICATION_COOKIE);
        if (!notif_cookie) {
          notif_cookie = "";
        }
        const current_notifs = announce.filter(ann => ann.endDate > tdy)
          .filter(ann => !notif_cookie.includes(ann.announceId));

        setNotifications(prev_notifs => mergeArraysByKey(prev_notifs, current_notifs, 'announceId'));
      })
      .catch(error => {
        console.error('There was a problem checking for Notifications:', error);
      });
  };

  const newNotification = (event:any) => {
    const notification = event.detail;
    setNotifications(prev_notifs => mergeArraysByKey(prev_notifs, [notification], 'announceId'));
  };

  useEffect(() => {
    const announce = window._clientConfig.announcements;
    const tdy = todayStr();
    let notif_cookie = getCookie(NOTIFICATION_COOKIE);
    if (!notif_cookie) {
      notif_cookie = "";
    }
    const current_notifs = announce.filter(ann => ann.endDate > tdy)
      .filter(ann => !notif_cookie.includes(ann.announceId));

    setNotifications(current_notifs);

    // trigger server call to check notifications
    const checkNotificationsRef:NodeJS.Timeout = setInterval(checkNotifications, checkNotificationsInterval);

    document.addEventListener("mouseup", autoHideListener);
    document.addEventListener("scroll", autoHideListener);
    document.addEventListener("keydown", autoHideListener);
    window.addEventListener("newNotification", newNotification);

    // clean up cookie
    if (notif_cookie) {
      const current_notif_ids = announce.map(ann => ann.announceId).join(",");
      const notif_ids = notif_cookie.split(',');
      const new_notif_ids = notif_ids.filter(n_id => current_notif_ids.includes(n_id)).join(",");
      document.cookie = `${NOTIFICATION_COOKIE}=${new_notif_ids}; max-age=${cookie_age}`;
    }

    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener("mouseup", autoHideListener);
      document.removeEventListener("scroll", autoHideListener);
      document.removeEventListener("keydown", autoHideListener);
      window.removeEventListener("newNotification", newNotification);
      clearInterval(checkNotificationsRef);
    };

  }, []);

  const handleNotificationClick = (notif: Notification) => {
    const ns = notifications.filter(n => n.announceId !== notif.announceId);

    // persistent management
    if (notif.lifespan == PERSISTENT) {
      const current_cookie = getCookie(NOTIFICATION_COOKIE);
      let new_cookie = notif.announceId;
      if (current_cookie) {
        new_cookie = current_cookie + "," + notif.announceId;
      }
      document.cookie = `${NOTIFICATION_COOKIE}=${new_cookie}; max-age=${cookie_age}`;
    }

    setNotifications(ns);
  };

  return (
    <div className="outer-notifications" key="notification-banner">
      {notifications.map((notification, index, array) => (
        <div className={'notification-container' + ((index === array.length - 1) ? '-last' : '') + ' notification-' + notification.category}
             key={"notification-" + notification.announceId}>
          <div className="notification-start" key={"notification-start-" + notification.announceId}>
            <div className="notification-start-icon" key={"notification-start-icon-" + notification.announceId}>
              {getIcon(notification)}
            </div>
          </div>
          <div className={'notification'} key={"notification-descrip-" + notification.announceId}>
            <div className={'notification-inner'} key={"notification-inner-" + notification.announceId}>
              <span tabIndex={0} role="alert" aria-label={'Notification ' + notification.description}
                    key={"notification-inner-" + notification.announceId}>
                {notification.description}&nbsp;
              </span>
              {(notification.url && notification.url != "") &&
                <span tabIndex={0}
                      key={"notification-url-" + notification.announceId}
                      role="link"
                      aria-label={DEFAULT_URL_TEXT}>
                  &nbsp;
                  <a className="notification-url" target="_blank" rel="noreferrer" href={notification.url}>
                    {notification.urlText ? notification.urlText : DEFAULT_URL_TEXT}
                  </a>
                </span>
              }
            </div>
          </div>
          <div className={'notification-end'} key={"notification-close-" + notification.announceId}>
            <div tabIndex={0}
                 role="button"
                 aria-label={NOTIFICATION_LABEL}
                 className={'notification-button notification-' + notification.category}
                 key={"notification-end-icon-" + notification.announceId}
                 onClick={() => handleNotificationClick(notification)}>
              {crossIcon()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const notificationsBanner = angular.module('gr.notificationsBanner', [])
  .component('notificationsBanner', react2angular(NotificationsBanner));
