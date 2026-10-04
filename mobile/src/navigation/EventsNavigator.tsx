import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { EventsStackParamList } from "./types";
import EventDetailScreen from "../screens/events/EventDetailScreen";
import EventsHomeScreen from "../screens/events/EventsHomeScreen";
import MyTicketsScreen from "../screens/events/MyTicketsScreen";
import OrganizerScannerScreen from "../screens/events/OrganizerScannerScreen";

const Stack = createNativeStackNavigator<EventsStackParamList>();

export default function EventsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EventsHome" component={EventsHomeScreen} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
      <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
      <Stack.Screen name="OrganizerScanner" component={OrganizerScannerScreen} />
    </Stack.Navigator>
  );
}
