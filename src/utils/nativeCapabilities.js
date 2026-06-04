import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Abstraction for Camera Capture, detecting if native Capacitor or Web Fallback
export async function takeNativePhoto() {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera
    });
    return image.dataUrl;
  } catch (error) {
    console.warn("Native camera failed, or user canceled.", error);
    throw error;
  }
}

// Abstraction to check native environment
export function isNativeApp() {
    return window.Capacitor && window.Capacitor.isNative;
}
