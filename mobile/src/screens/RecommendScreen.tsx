import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { ClothingItem, Occasion, OutfitRecommendation, WeatherData } from '../types';

const OCCASIONS: Occasion[] = ['casual', 'work', 'formal', 'date', 'workout'];

const WMO_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'icy fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  80: 'showers', 81: 'heavy showers', 82: 'violent showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

export default function RecommendScreen() {
  const [occasion, setOccasion] = useState<Occasion>('casual');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [manualCity, setManualCity] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<OutfitRecommendation | null>(null);
  const [recommendedItems, setRecommendedItems] = useState<ClothingItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchWeatherByCoords(lat: number, lon: number) {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=celsius`
    );
    const json = await res.json();
    const temp = Math.round(json.current.temperature_2m);
    const desc = WMO_CODES[json.current.weathercode as number] ?? 'unknown';
    return { temperature: temp, description: desc };
  }

  async function fetchWeatherByCity(city: string) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );
    const geoJson = await geoRes.json();
    if (!geoJson.results?.length) throw new Error(`City "${city}" not found.`);
    const { latitude, longitude } = geoJson.results[0];
    return fetchWeatherByCoords(latitude, longitude);
  }

  async function handleGetWeather() {
    setFetchingWeather(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShowManualInput(true);
        setFetchingWeather(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const w = await fetchWeatherByCoords(loc.coords.latitude, loc.coords.longitude);
      setWeather(w);
    } catch (err) {
      setShowManualInput(true);
    }
    setFetchingWeather(false);
  }

  async function handleManualWeather() {
    if (!manualCity.trim()) return;
    setFetchingWeather(true);
    try {
      const w = await fetchWeatherByCity(manualCity.trim());
      setWeather(w);
      setShowManualInput(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not find city.');
    }
    setFetchingWeather(false);
  }

  async function handleRecommend() {
    setLoading(true);
    setError(null);
    setRecommendation(null);

    const { data: items, error: itemsErr } = await supabase
      .from('clothing_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (itemsErr || !items) {
      setError('Failed to load your wardrobe.');
      setLoading(false);
      return;
    }

    if (items.length === 0) {
      setError('Your wardrobe is empty. Add some items first!');
      setLoading(false);
      return;
    }

    // Check for required categories
    const cats = new Set(items.map((i: ClothingItem) => i.category));
    const missing: string[] = [];
    if (!cats.has('top')) missing.push('tops');
    if (!cats.has('bottom') && !cats.has('shoes')) missing.push('bottoms or shoes');

    if (missing.length > 0) {
      setError(
        `Your wardrobe is missing: ${missing.join(', ')}. Add more items for better recommendations.`
      );
      setLoading(false);
      return;
    }

    const wardrobePayload = items.map((i: ClothingItem) => ({
      id: i.id,
      category: i.category,
      color: i.color,
      style_tags: i.style_tags,
    }));

    const { data, error: fnErr } = await supabase.functions.invoke('recommend-outfit', {
      body: {
        wardrobe: wardrobePayload,
        weather: weather,
        occasion,
      },
    });

    if (fnErr || data?.error) {
      setError(data?.error ?? "Couldn't generate recommendation. Try again.");
      setLoading(false);
      return;
    }

    const rec: OutfitRecommendation = data;
    setRecommendation(rec);
    setRecommendedItems(items.filter((i: ClothingItem) => rec.item_ids.includes(i.id)));
    setLoading(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Occasion</Text>
      <View style={styles.row}>
        {OCCASIONS.map((o) => (
          <TouchableOpacity
            key={o}
            style={[styles.chip, occasion === o && styles.chipActive]}
            onPress={() => setOccasion(o)}
          >
            <Text style={[styles.chipText, occasion === o && styles.chipTextActive]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Weather</Text>
      {weather ? (
        <View style={styles.weatherCard}>
          <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
          <Text style={styles.weatherDesc}>{weather.description}</Text>
          <TouchableOpacity onPress={() => setWeather(null)}>
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {showManualInput ? (
            <View style={styles.manualRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={manualCity}
                onChangeText={setManualCity}
                placeholder="Enter city name"
                placeholderTextColor="#555"
                returnKeyType="search"
                onSubmitEditing={handleManualWeather}
              />
              <TouchableOpacity
                style={styles.goBtn}
                onPress={handleManualWeather}
                disabled={fetchingWeather}
              >
                {fetchingWeather ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.goBtnText}>Go</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.weatherBtn}
              onPress={handleGetWeather}
              disabled={fetchingWeather}
            >
              {fetchingWeather ? (
                <ActivityIndicator color="#6366f1" />
              ) : (
                <Text style={styles.weatherBtnText}>📍 Use my location</Text>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.optionalNote}>
            Weather is optional — recommendation works without it.
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.recommendBtn, loading && styles.btnDisabled]}
        onPress={handleRecommend}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.recommendBtnText}>Get outfit recommendation</Text>
        )}
      </TouchableOpacity>

      {recommendation && (
        <View style={styles.resultSection}>
          <Text style={styles.sectionTitle}>Your outfit</Text>
          <Text style={styles.rationale}>{recommendation.rationale}</Text>
          <View style={styles.outfitGrid}>
            {recommendedItems.map((item) => (
              <View key={item.id} style={styles.outfitCard}>
                <Image source={{ uri: item.image_url }} style={styles.outfitImg} />
                <Text style={styles.outfitCategory}>{item.category}</Text>
                <Text style={styles.outfitColor}>{item.color}</Text>
              </View>
            ))}
          </View>
          {recommendedItems.length === 0 && (
            <Text style={styles.noItems}>No matching items found in wardrobe.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 20, paddingBottom: 60 },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 24,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  weatherCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  weatherTemp: { color: '#fff', fontSize: 24, fontWeight: '700' },
  weatherDesc: { color: '#888', fontSize: 14, flex: 1, textTransform: 'capitalize' },
  changeLink: { color: '#6366f1', fontSize: 14 },
  weatherBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  weatherBtnText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  goBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  goBtnText: { color: '#fff', fontWeight: '700' },
  optionalNote: { color: '#444', fontSize: 12, marginTop: 8 },
  recommendBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 32,
  },
  btnDisabled: { opacity: 0.6 },
  recommendBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errBox: {
    backgroundColor: '#2a0000',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#550000',
    marginTop: 16,
  },
  errText: { color: '#ff6666', fontSize: 14, lineHeight: 20 },
  resultSection: { marginTop: 8 },
  rationale: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  outfitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  outfitCard: {
    width: '47%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  outfitImg: { width: '100%', aspectRatio: 0.75, backgroundColor: '#222' },
  outfitCategory: {
    color: '#fff',
    fontWeight: '700',
    textTransform: 'capitalize',
    fontSize: 13,
    padding: 10,
    paddingBottom: 2,
  },
  outfitColor: { color: '#888', fontSize: 12, paddingHorizontal: 10, paddingBottom: 10, textTransform: 'capitalize' },
  noItems: { color: '#555', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
