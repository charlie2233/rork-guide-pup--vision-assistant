import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";

export default function Index() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Redirect href="/capture" />
    </View>
  );
}
