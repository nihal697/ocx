import { useEffect, useState } from "react"
import { Dimensions, Keyboard, Platform } from "react-native"

// KeyboardAvoidingView is unreliable on Android under Expo SDK 54 / RN 0.81
// with edge-to-edge (Android 15+): the system ignores android:windowSoftInputMode
// adjustResize, so KeyboardAvoidingView's JS-measured keyboard height comes out
// wrong and the composer is left hidden behind the keyboard (see #53/#70/#147).
// Track the height directly from the Keyboard events and pad the composer
// instead — deterministic and independent of native window resize.
//
// iOS uses keyboardWillChangeFrame (not just willShow): it emits on EVERY
// height change while the keyboard is up (candidate/suggestion bar toggles,
// dictation, IME switch), so the padding tracks the live height instead of
// going stale after the initial show event.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const frameEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const setFrom = (e: { endCoordinates?: { height: number } }) => {
      const h = e.endCoordinates?.height ?? 0
      // Sanity guard: some IMEs report a full-screen height on the initial
      // frame; an end height >= screen dims can't be a real keyboard and
      // would push the composer off-screen. Treat it as hidden for this frame.
      setHeight(h > 0 && h < screenHeight ? h : 0)
    }
    const onHide = () => setHeight(0)

    // On iOS willChangeFrame also covers show (first frame ends with the
    // keyboard height); subscribing to both would double-apply nothing harmful,
    // but change-frame alone fires reliably. Keep willShow for Android parity.
    const showSub = Keyboard.addListener(showEvent, setFrom)
    const frameSub = Platform.OS === "ios" ? Keyboard.addListener(frameEvent, setFrom) : null
    const hideSub = Keyboard.addListener(hideEvent, onHide)
    return () => {
      showSub.remove()
      frameSub?.remove()
      hideSub.remove()
    }
  }, [])

  return height
}

const screenHeight = Dimensions.get("window").height