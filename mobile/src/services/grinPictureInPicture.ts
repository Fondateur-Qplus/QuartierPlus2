import { requireNativeModule } from "expo-modules-core";
import { startIOSPIP } from "@livekit/react-native-webrtc";
import { Platform } from "react-native";

type AndroidPipModule = {
  isSupported: () => boolean;
  enterPictureInPicture: (width: number, height: number) => boolean;
};

export const enterGrinPictureInPicture = (
  videoRef: React.RefObject<unknown>,
): boolean => {
  if (Platform.OS === "ios") {
    if (!videoRef.current) {
      throw new Error("Aucune vidéo du Grin n'est disponible pour le mode PiP.");
    }
    startIOSPIP(videoRef);
    return true;
  }
  if (Platform.OS === "android") {
    const pip = requireNativeModule<AndroidPipModule>("GrinPip");
    if (!pip.isSupported()) {
      return false;
    }
    return pip.enterPictureInPicture(16, 9);
  }
  return false;
};
