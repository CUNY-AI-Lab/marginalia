'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSources,
  saveSources,
  getDocuments,
  saveDocuments,
  getConversations,
  saveConversations,
  generateId,
  segmentIntoParagraphs,
} from '@/lib/storage';
import { Source, Document, Conversation, SOURCE_COLORS } from '@/lib/types';

export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSources(getSources());
    setLoading(false);
  }, []);

  const addSource = useCallback((source: Omit<Source, 'id' | 'createdAt' | 'color'>) => {
    const currentSources = getSources();
    const newSource: Source = {
      ...source,
      id: generateId(),
      color: SOURCE_COLORS[currentSources.length % SOURCE_COLORS.length],
      createdAt: Date.now(),
    };
    const updated = [...currentSources, newSource];
    saveSources(updated);
    setSources(updated);
    return newSource;
  }, []);

  const updateSource = useCallback((id: string, updates: Partial<Source>) => {
    const currentSources = getSources();
    const updated = currentSources.map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    saveSources(updated);
    setSources(updated);
  }, []);

  const deleteSource = useCallback((id: string) => {
    const currentSources = getSources();
    const updated = currentSources.filter(s => s.id !== id);
    saveSources(updated);
    setSources(updated);
  }, []);

  const refresh = useCallback(() => {
    setSources(getSources());
  }, []);

  return { sources, loading, addSource, updateSource, deleteSource, refresh };
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDocuments(getDocuments());
    setLoading(false);
  }, []);

  const addDocument = useCallback((doc: Omit<Document, 'id' | 'createdAt' | 'paragraphs'>) => {
    const currentDocs = getDocuments();
    const newDoc: Document = {
      ...doc,
      id: generateId(),
      paragraphs: segmentIntoParagraphs(doc.content),
      createdAt: Date.now(),
    };
    const updated = [...currentDocs, newDoc];
    saveDocuments(updated);
    setDocuments(updated);
    return newDoc;
  }, []);

  const updateDocument = useCallback((id: string, updates: Partial<Document>) => {
    const currentDocs = getDocuments();
    const updated = currentDocs.map(d => {
      if (d.id !== id) return d;
      const newDoc = { ...d, ...updates };
      // Re-segment if content changed
      if (updates.content) {
        newDoc.paragraphs = segmentIntoParagraphs(updates.content);
      }
      return newDoc;
    });
    saveDocuments(updated);
    setDocuments(updated);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    const currentDocs = getDocuments();
    const updated = currentDocs.filter(d => d.id !== id);
    saveDocuments(updated);
    setDocuments(updated);
  }, []);

  const refresh = useCallback(() => {
    setDocuments(getDocuments());
  }, []);

  return { documents, loading, addDocument, updateDocument, deleteDocument, refresh };
}

export function useConversations(docId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (docId) {
      setConversations(getConversations(docId));
    } else {
      setConversations([]);
    }
  }, [docId]);

  const addMessage = useCallback(
    (sourceId: string, message: { role: 'user' | 'assistant'; content: string }) => {
      if (!docId) return;

      const current = getConversations(docId);
      let conversation = current.find(c => c.sourceId === sourceId);

      if (!conversation) {
        conversation = { sourceId, messages: [] };
        current.push(conversation);
      }

      conversation.messages.push({
        ...message,
        timestamp: Date.now(),
      });

      saveConversations(docId, current);
      setConversations([...current]);
    },
    [docId]
  );

  const clearConversations = useCallback(() => {
    if (!docId) return;
    saveConversations(docId, []);
    setConversations([]);
  }, [docId]);

  return { conversations, addMessage, clearConversations };
}
