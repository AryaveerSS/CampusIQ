import { useState, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Tag input component — type a value, press Enter or click +, see a pill tag.
 * Props:
 *   tags        - string[]
 *   onChange    - (newTags: string[]) => void
 *   placeholder - string
 *   transform   - optional fn applied to each tag before adding (e.g. toLowerCase)
 */
export default function TagInput({ tags = [], onChange, placeholder = 'Add...', transform }) {
    const [input, setInput] = useState('');
    const inputRef = useRef(null);

    function add() {
        const val = transform ? transform(input.trim()) : input.trim();
        if (!val) return;
        if (tags.includes(val)) { setInput(''); return; }   // no duplicates
        onChange([...tags, val]);
        setInput('');
        inputRef.current?.focus();
    }

    function remove(tag) {
        onChange(tags.filter(t => t !== tag));
    }

    function onKeyDown(e) {
        if (e.key === 'Enter') { e.preventDefault(); add(); }
        // Backspace on empty input removes the last tag
        if (e.key === 'Backspace' && !input && tags.length) {
            onChange(tags.slice(0, -1));
        }
    }

    return (
        <div
            className="input-base flex flex-wrap gap-1.5 cursor-text min-h-[42px] py-2"
            onClick={() => inputRef.current?.focus()}
        >
            {tags.map(tag => (
                <span key={tag}
                    className="flex items-center gap-1 bg-surface-raised border border-surface-border rounded-md px-2 py-0.5 text-xs text-slate-300">
                    {tag}
                    <button type="button" onClick={(e) => { e.stopPropagation(); remove(tag); }}
                        className="text-slate-500 hover:text-red-400 transition-colors">
                        <X size={10} />
                    </button>
                </span>
            ))}
            <div className="flex items-center gap-1 flex-1 min-w-24">
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={tags.length ? '' : placeholder}
                    className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-600 min-w-0"
                />
                {input.trim() && (
                    <button type="button" onClick={add}
                        className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 hover:bg-accent/40 text-accent flex items-center justify-center transition-colors">
                        <Plus size={11} />
                    </button>
                )}
            </div>
        </div>
    );
}
