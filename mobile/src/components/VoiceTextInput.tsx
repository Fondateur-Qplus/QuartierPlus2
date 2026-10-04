import { useCallback, useEffect, useRef, useState } from "react";
import {
  TextInput,
  type TextInputProps,
} from "react-native";
import { useVoiceAssistant } from "../context/VoiceAssistantContext";

export default function VoiceTextInput(props: TextInputProps) {
  const { registerInput } = useVoiceAssistant();
  const inputValueRef = useRef(props.value ?? props.defaultValue ?? "");
  const [uncontrolledValue, setUncontrolledValue] = useState(
    props.defaultValue ?? "",
  );
  const unregisterInputRef = useRef<(() => void) | null>(null);
  const isControlled = props.value !== undefined;

  useEffect(() => {
    if (typeof props.value === "string") inputValueRef.current = props.value;
  }, [props.value]);

  const handleChangeText = useCallback(
    (value: string) => {
      inputValueRef.current = value;
      if (!isControlled) setUncontrolledValue(value);
      props.onChangeText?.(value);
    },
    [isControlled, props.onChangeText],
  );

  const insertText = useCallback(
    (text: string) => {
      const currentText = inputValueRef.current;
      const separator = currentText && !/\s$/.test(currentText) ? " " : "";
      const nextText = `${currentText}${separator}${text.trim()}`;
      inputValueRef.current = nextText;
      if (!isControlled) setUncontrolledValue(nextText);
      props.onChangeText?.(nextText);
    },
    [isControlled, props.onChangeText],
  );

  const handleFocus: TextInputProps["onFocus"] = (event) => {
    unregisterInputRef.current?.();
    unregisterInputRef.current = registerInput(insertText);
    props.onFocus?.(event);
  };

  useEffect(
    () => () => {
      unregisterInputRef.current?.();
      unregisterInputRef.current = null;
    },
    [],
  );

  return (
    <TextInput
      {...props}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
      value={isControlled ? props.value : uncontrolledValue}
    />
  );
}
