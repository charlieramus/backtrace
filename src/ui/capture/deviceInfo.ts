// Minimal device/OS provenance from the user-agent string (V9 S1). The court record wants
// "what took this reading"; we parse only what's honestly inferable from navigator.userAgent
// (never fingerprinting), and leave the rest null. Pure so it's unit-checkable.

import { APP_VERSION } from "../../io/savefile";

export interface DeviceInfo {
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string;
}

/** Parse a coarse device model + OS string from a user-agent. Best-effort, null when unsure. */
export function parseDeviceInfo(ua: string): DeviceInfo {
  let os: string | null = null;
  let device: string | null = null;

  const iOS = /\b(iPhone|iPad|iPod)\b/.exec(ua);
  const iOSVer = /OS (\d+[_.]\d+(?:[_.]\d+)?)/.exec(ua);
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  const androidModel = /;\s*([^;)]+?)\s+Build\//.exec(ua);
  const windows = /Windows NT (\d+\.\d+)/.exec(ua);
  const mac = /Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/.exec(ua);

  if (iOS) {
    device = iOS[1];
    os = iOSVer ? `iOS ${iOSVer[1].replace(/_/g, ".")}` : "iOS";
  } else if (android) {
    os = `Android ${android[1]}`;
    if (androidModel) device = androidModel[1].trim();
  } else if (windows) {
    os = `Windows NT ${windows[1]}`;
  } else if (mac) {
    os = `macOS ${mac[1].replace(/_/g, ".")}`;
  }

  return { deviceModel: device, osVersion: os, appVersion: APP_VERSION };
}

/** Device info for the running browser (null-safe outside a browser). */
export function currentDeviceInfo(): DeviceInfo {
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  return parseDeviceInfo(ua);
}
