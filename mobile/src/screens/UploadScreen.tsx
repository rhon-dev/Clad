import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Category, ClothingItem } from '../types';

const CATEGORIES: Category[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

type AnalysisResult = {
  category: Category;
  color: string;
  style_tags: string[];
};

type Phase = 'pick' | 'analyzing' | 'review' | 'saving';

export default function UploadScreen() {
  const navigation = useNavigation();
  const [phase, setPhase] = useState<Phase>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function pickImage(fromCamera: boolean) {
    let result;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera access is required to take photos.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    }

    if (result.canceled || !result.assets[0]) return;
    await processImage(result.assets[0].uri);
  }

  async function processImage(uri: string) {
    // Compress to max 1024px
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Check size
    const response = await fetch(compressed.uri);
    const blob = await response.blob();
    if (blob.size > MAX_BYTES) {
      Alert.alert(
        'Image too large',
        'Image exceeds 5MB after compression. Please choose a smaller image.'
      );
      return;
    }

    setImageUri(compressed.uri);
    setPhase('analyzing');
    setAnalyzeError(false);
    await analyzeImage(compressed.uri);
  }

  async function analyzeImage(uri: string) {
    try {
      // First upload to get a URL for the edge function
      const user = (await supabase.auth.getUser()).data.user!;
      const filename = `${user.id}/temp_${Date.now()}.jpg`;

      const blob = await (await fetch(uri)).blob();
      const { error: uploadErr } = await supabase.storage
        .from('wardrobe-photos')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: signed } = await supabase.storage
        .from('wardrobe-photos')
        .createSignedUrl(filename, 300); // 5 min for analysis

      if (!signed?.signedUrl) throw new Error('Failed to get signed URL');

      const { data, error } = await supabase.functions.invoke('analyze-clothing', {
        body: { imageUrl: signed.signedUrl },
      });

      if (error) throw error;
      if (data.error) {
        // Gemini failed — let user tag manually
        setAnalysis({ category: 'top', color: '', style_tags: [] });
        setAnalyzeError(true);
      } else {
        setAnalysis({
          category: data.category as Category,
          color: data.color ?? '',
          style_tags: data.style_tags ?? [],
        });
      }
      setPhase('review');
    } catch (err) {
      console.error('analyze error', err);
      setAnalysis({ category: 'top', color: '', style_tags: [] });
      setAnalyzeError(true);
      setPhase('review');
    }
  }

  async function saveItem() {
    if (!imageUri || !analysis) return;
    setPhase('saving');
    setUploadError(null);

    const user = (await supabase.auth.getUser()).data.user!;
    const filename = `${user.id}/${Date.now()}.jpg`;

    let attempt = 0;
    let uploadOk = false;

    while (attempt < 2 && !uploadOk) {
      try {
        const blob = await (await fetch(imageUri)).blob();
        const { error: uploadErr } = await supabase.storage
          .from('wardrobe-photos')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw uploadErr;
        uploadOk = true;
      } catch (err) {
        attempt++;
        if (attempt >= 2) {
          setUploadError('Upload failed. Check your connection and try again.');
          setPhase('review');
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const { data: signed } = await supabase.storage
      .from('wardrobe-photos')
      .createSignedUrl(filename, 60 * 60 * 24 * 365); // 1 year

    const imageUrl = signed?.signedUrl ?? '';

    const { error: dbErr } = await supabase.from('clothing_items').insert({
      user_id: user.id,
      image_url: imageUrl,
      category: analysis.category,
      color: analysis.color,
      style_tags: analysis.style_tags,
    });

    if (dbErr) {
      setUploadError('Failed to save item. Try again.');
      setPhase('review');
      return;
    }

    navigation.goBack();
  }

  if (phase === 'pick') {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Add clothing item</Text>
        <TouchableOpacity style={styles.optBtn} onPress={() => pickImage(true)}>
          <Text style={styles.optIcon}>📷</Text>
          <Text style={styles.optText}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optBtn} onPress={() => pickImage(false)}>
          <Text style={styles.optIcon}>🖼️</Text>
          <Text style={styles.optText}>Choose from library</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'analyzing') {
    return (
      <View style={styles.center}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 24 }} />
        <Text style={styles.status}>Analyzing your item...</Text>
      </View>
    );
  }

  if ((phase === 'review' || phase === 'saving') && analysis) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.previewLarge} />}

        {analyzeError && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              Couldn't analyze photo automatically. Please fill in the details below.
            </Text>
          </View>
        )}

        {uploadError && (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{uploadError}</Text>
          </View>
        )}

        <Text style={styles.label}>Category</Text>
        <View style={styles.row}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, analysis.category === c && styles.chipActive]}
              onPress={() => setAnalysis({ ...analysis, category: c })}
            >
              <Text style={[styles.chipText, analysis.category === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Color</Text>
        <TextInput
          style={styles.input}
          value={analysis.color}
          onChangeText={(v) => setAnalysis({ ...analysis, color: v })}
          placeholder="e.g. navy, white, black"
          placeholderTextColor="#555"
        />

        <Text style={styles.label}>Style tags (comma-separated)</Text>
        <TextInput
          style={styles.input}
          value={analysis.style_tags.join(', ')}
          onChangeText={(v) =>
            setAnalysis({ ...analysis, style_tags: v.split(',').map((s) => s.trim()).filter(Boolean) })
          }
          placeholder="e.g. casual, formal"
          placeholderTextColor="#555"
        />

        <TouchableOpacity
          style={[styles.saveBtn, phase === 'saving' && styles.btnDisabled]}
          onPress={saveItem}
          disabled={phase === 'saving'}
        >
          {phase === 'saving' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save to wardrobe</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 32 },
  optBtn: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  optIcon: { fontSize: 40, marginBottom: 8 },
  optText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  preview: { width: 200, height: 250, borderRadius: 12, backgroundColor: '#222' },
  previewLarge: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    backgroundColor: '#222',
    marginBottom: 24,
  },
  status: { color: '#888', marginTop: 16, fontSize: 15 },
  reviewContent: { padding: 20 },
  label: { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 16, padding: 12 },
  cancelBtnText: { color: '#555', fontSize: 15 },
  warnBox: {
    backgroundColor: '#2a2000',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#554400',
    marginBottom: 8,
  },
  warnText: { color: '#ffcc00', fontSize: 13, lineHeight: 18 },
  errBox: {
    backgroundColor: '#2a0000',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#550000',
    marginBottom: 8,
  },
  errText: { color: '#ff4444', fontSize: 13, lineHeight: 18 },
});
