import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type PropsWithChildren,
} from "react";

type VoiceAssistantContextValue = {
  registerInput: (insertText: (text: string) => void) => () => void;
  insertIntoFocusedInput: (text: string) => boolean;
  clearActiveInput: () => void;
};

const VoiceAssistantContext =
  createContext<VoiceAssistantContextValue | null>(null);

export function VoiceAssistantProvider({ children }: PropsWithChildren) {
  const activeInputRef = useRef<((text: string) => void) | null>(null);

  const registerInput = useCallback(
    (insertText: (text: string) => void) => {
      activeInputRef.current = insertText;
      return () => {
        if (activeInputRef.current === insertText) {
          activeInputRef.current = null;
        }
      };
    },
    [],
  );

  const insertIntoFocusedInput = useCallback((text: string) => {
    if (!activeInputRef.current) return false;
    activeInputRef.current(text);
    return true;
  }, []);

  const clearActiveInput = useCallback(() => {
    activeInputRef.current = null;
  }, []);

  return (
    <VoiceAssistantContext.Provider
      value={{ clearActiveInput, insertIntoFocusedInput, registerInput }}
    >
      {children}
    </VoiceAssistantContext.Provider>
  );
}

export function useVoiceAssistant() {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error(
      "useVoiceAssistant must be used within a VoiceAssistantProvider.",
    );
  }
  return context;
}
