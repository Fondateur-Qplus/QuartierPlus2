import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Mic } from "lucide-react-native";
import { useVoiceAssistant } from "../context/VoiceAssistantContext";

export default function VoiceTextInput(props: TextInputProps) {
  const {
    recognitionAvailable,
    registerInput,
    requestDictation,
  } = useVoiceAssistant();
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

  const flattenedStyle = StyleSheet.flatten(props.style);
  const { width, ...textStyle } = flattenedStyle ?? {};

  return (
    <View style={[styles.container, width ? { width } : null]}>
      <TextInput
        {...props}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        style={[textStyle, styles.input]}
        value={isControlled ? props.value : uncontrolledValue}
      />
      {recognitionAvailable ? (
        <Pressable
          accessibilityLabel="Dicter dans ce champ"
          accessibilityRole="button"
          onPress={requestDictation}
          style={styles.dictationButton}
        >
          <Mic color="#2563eb" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    minWidth: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  dictationButton: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    justifyContent: "center",
    marginLeft: 8,
    minHeight: 40,
    minWidth: 40,
  },
});
