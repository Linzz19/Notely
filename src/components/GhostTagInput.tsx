import React, { useEffect, useMemo, useRef, useState } from 'react';

interface GhostTagInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  suggestions: string[];
  excludeTags?: string[];
  allowCommaSeparated?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  containerClassName?: string;
  paddingClassName?: string;
  inputTextClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

interface ParsedSegment {
  beforeSegment: string;
  normalizedQuery: string;
  earlierTags: Set<string>;
  hasTrailingSpace: boolean;
}

function parseActiveSegment(
  rawValue: string,
  allowCommaSeparated: boolean
): ParsedSegment {
  if (!allowCommaSeparated) {
    const hasTrailingSpace = /\s$/.test(rawValue);
    const trimmedStart = rawValue.trimStart();
    const normalizedQuery = trimmedStart.replace(/^#+/, '').toLowerCase();
    return {
      beforeSegment: '',
      normalizedQuery,
      earlierTags: new Set<string>(),
      hasTrailingSpace,
    };
  }

  const lastCommaIdx = rawValue.lastIndexOf(',');
  if (lastCommaIdx === -1) {
    const hasTrailingSpace = /\s$/.test(rawValue);
    const trimmedStart = rawValue.trimStart();
    const normalizedQuery = trimmedStart.replace(/^#+/, '').toLowerCase();
    return {
      beforeSegment: '',
      normalizedQuery,
      earlierTags: new Set<string>(),
      hasTrailingSpace,
    };
  }

  const beforeComma = rawValue.slice(0, lastCommaIdx + 1);
  const afterComma = rawValue.slice(lastCommaIdx + 1);
  const leadingSpacesMatch = afterComma.match(/^\s*/);
  const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[0] : '';
  const segmentBody = afterComma.slice(leadingSpaces.length);

  const earlierTags = new Set(
    rawValue
      .slice(0, lastCommaIdx)
      .split(',')
      .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
      .filter(Boolean)
  );

  return {
    beforeSegment: beforeComma + leadingSpaces,
    normalizedQuery: segmentBody.replace(/^#+/, '').toLowerCase(),
    earlierTags,
    hasTrailingSpace: /\s$/.test(segmentBody),
  };
}

export const GhostTagInput: React.FC<GhostTagInputProps> = ({
  value,
  onChange,
  suggestions,
  excludeTags = [],
  allowCommaSeparated = false,
  inputRef,
  placeholder,
  maxLength,
  ariaLabel,
  containerClassName = '',
  paddingClassName = 'px-1.5',
  inputTextClassName = 'text-slate-800 dark:text-slate-200 placeholder:text-slate-400',
  onKeyDown,
  onBlur,
}) => {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? internalRef;

  const [isFocused, setIsFocused] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Sync focus state if the parent autofocuses the input via ref
  useEffect(() => {
    const el = resolvedRef.current;
    if (el && document.activeElement === el) {
      setIsFocused(true);
    }
  }, [resolvedRef]);

  // Reset cycle index and dismissal whenever the typed value changes
  useEffect(() => {
    setMatchIndex(0);
    setIsDismissed(false);
  }, [value]);

  const parsed = useMemo(
    () => parseActiveSegment(value, allowCommaSeparated),
    [value, allowCommaSeparated]
  );

  const excludedSet = useMemo(() => {
    const set = new Set(excludeTags.map((t) => t.toLowerCase()));
    for (const earlier of parsed.earlierTags) {
      set.add(earlier);
    }
    return set;
  }, [excludeTags, parsed.earlierTags]);

  const matches = useMemo(() => {
    if (!parsed.normalizedQuery || parsed.hasTrailingSpace) {
      return [];
    }
    return suggestions.filter((tag) => {
      const lower = tag.toLowerCase();
      return (
        lower.startsWith(parsed.normalizedQuery) &&
        lower.length > parsed.normalizedQuery.length &&
        !excludedSet.has(lower)
      );
    });
  }, [suggestions, parsed.normalizedQuery, parsed.hasTrailingSpace, excludedSet]);

  const activeMatch =
    isFocused && !isDismissed && matches.length > 0
      ? matches[matchIndex % matches.length]
      : null;

  const ghostSuffix = activeMatch
    ? activeMatch.slice(parsed.normalizedQuery.length)
    : '';

  const syncScroll = (el: HTMLInputElement | null) => {
    if (!el) return;
    if (el.scrollLeft !== scrollLeft) {
      setScrollLeft(el.scrollLeft);
    }
  };

  const acceptMatch = () => {
    if (!activeMatch) return;
    const completed = `${parsed.beforeSegment}${activeMatch}`;
    onChange(completed);
    setIsDismissed(false);
    setMatchIndex(0);
    requestAnimationFrame(() => {
      const el = resolvedRef.current;
      if (el) {
        el.focus();
        const end = completed.length;
        el.setSelectionRange(end, end);
        setScrollLeft(el.scrollLeft);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeMatch) {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptMatch();
        return;
      }

      if (e.key === 'ArrowRight') {
        const el = e.currentTarget;
        if (
          el.selectionStart === value.length &&
          el.selectionEnd === value.length
        ) {
          e.preventDefault();
          acceptMatch();
          return;
        }
      }

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length > 1) {
        e.preventDefault();
        setMatchIndex((prev) =>
          e.key === 'ArrowDown'
            ? (prev + 1) % matches.length
            : (prev - 1 + matches.length) % matches.length
        );
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setIsDismissed(true);
        return;
      }
    }

    onKeyDown?.(e);
  };

  return (
    <div className={`relative flex items-center ${containerClassName}`}>
      {/* Pixel-aligned inline ghost completion mirror */}
      {ghostSuffix && (
        <div
          aria-hidden="true"
          className={`pointer-events-none select-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-xs font-normal leading-normal ${paddingClassName}`}
        >
          <span
            className="inline-block whitespace-pre"
            style={
              scrollLeft > 0
                ? { transform: `translateX(-${scrollLeft}px)` }
                : undefined
            }
          >
            <span className="text-transparent">{value}</span>
            <span className="text-slate-400/75 dark:text-slate-500">
              {ghostSuffix}
            </span>
          </span>
        </div>
      )}

      <input
        ref={resolvedRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          syncScroll(e.currentTarget);
        }}
        onFocus={(e) => {
          setIsFocused(true);
          syncScroll(e.currentTarget);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          setIsDismissed(false);
          setScrollLeft(0);
          onBlur?.(e);
        }}
        onScroll={(e) => syncScroll(e.currentTarget)}
        onKeyUp={(e) => syncScroll(e.currentTarget)}
        onClick={(e) => syncScroll(e.currentTarget)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-autocomplete="inline"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`relative z-10 w-full h-full bg-transparent text-xs font-normal leading-normal focus:outline-none ${paddingClassName} ${inputTextClassName}`}
      />
    </div>
  );
};
