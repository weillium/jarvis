// Ultra-simple test - no imports that could fail
import { View, Text, StyleSheet } from 'react-native';

export default function SimplePage() {
  console.log('[SimplePage] Rendering - this should appear in console');
  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>SIMPLE TEST PAGE</Text>
      <Text style={styles.subtext}>If you see this, basic rendering works!</Text>
      <Text style={styles.subtext}>Check Metro console for logs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtext: {
    color: 'white',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
});

