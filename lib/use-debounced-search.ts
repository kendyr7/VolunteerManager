'use client';

import { useCallback, useEffect, useState } from 'react';

export function useDebouncedSearch(initialValue = '', delay = 100) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [appliedSearch, setAppliedSearch] = useState(initialValue.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(inputValue.trim());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, inputValue]);

  const applySearch = useCallback((value = inputValue) => {
    setAppliedSearch(value.trim());
  }, [inputValue]);

  const clearSearch = useCallback(() => {
    setInputValue('');
    setAppliedSearch('');
  }, []);

  return {
    inputValue,
    setInputValue,
    appliedSearch,
    setAppliedSearch,
    applySearch,
    clearSearch,
  };
}
