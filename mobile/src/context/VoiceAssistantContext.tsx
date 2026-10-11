import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type VoiceAssistantContextValue = {
  registerInput: (insertText: (text: string) => void) => () => void;
  insertIntoFocusedInput: (text: string) => boolean;
  registerDictationHandler: (start: () => void) => () => void;
  registerAssistantHandler: (start: () => void) => () => void;
  requestAssistant: () => void;
  isAssistantActive: boolean;
  setAssistantActive: (active: boolean) => void;
  requestDictation: () => void;
  recognitionAvailable: boolean | null;
  setRecognitionAvailable: (available: boolean) => void;
  clearActiveInput: () => void;
};

const VoiceAssistantContext =
  createContext<VoiceAssistantContextValue | null>(null);

export function VoiceAssistantProvider({ children }: PropsWithChildren) {
  const activeInputRef = useRef<((text: string) => void) | null>(null);
  const dictationHandlerRef = useRef<(() => void) | null>(null);
  const assistantHandlerRef = useRef<(() => void) | null>(null);
  const [recognitionAvailable, setRecognitionAvailable] = useState<
    boolean | null
  >(null);
  const [isAssistantActive, setAssistantActive] = useState(false);

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

  const registerDictationHandler = useCallback((start: () => void) => {
    dictationHandlerRef.current = start;
    return () => {
      if (dictationHandlerRef.current === start) {
        dictationHandlerRef.current = null;
      }
    };
  }, []);

  const requestDictation = useCallback(() => {
    dictationHandlerRef.current?.();
  }, []);

  const registerAssistantHandler = useCallback((start: () => void) => {
    assistantHandlerRef.current = start;
    return () => {
      if (assistantHandlerRef.current === start) assistantHandlerRef.current = null;
    };
  }, []);

  const requestAssistant = useCallback(() => {
    assistantHandlerRef.current?.();
  }, []);

  const clearActiveInput = useCallback(() => {
    activeInputRef.current = null;
  }, []);

  return (
    <VoiceAssistantContext.Provider
      value={{
        clearActiveInput,
        insertIntoFocusedInput,
        isAssistantActive,
        recognitionAvailable,
        registerAssistantHandler,
        registerDictationHandler,
        registerInput,
        requestAssistant,
        requestDictation,
        setAssistantActive,
        setRecognitionAvailable,
      }}
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
