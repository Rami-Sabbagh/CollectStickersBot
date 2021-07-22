import * as fs from 'fs';
import * as path from 'path';

import Mustache from 'mustache';
import { parse } from 'fast-csv';

const localizationPath = path.resolve('./localization.csv');

interface LocalizationEntry {
    /**
     * The id of the localization entry.
     */
    id: string,
    /**
     * The value of the localization entry in specific language codes.
     */
    [language_code: string]: string | undefined,
}

const localization: Record<string, LocalizationEntry | undefined> = {};

export async function load() {
    return new Promise((resolve, reject) => {
        fs.createReadStream(localizationPath).pipe(parse({
            trim: true,
            headers: true,
            ignoreEmpty: true,
        }))
            .on('data', (entry: LocalizationEntry) => localization[entry.id] = entry)
            .on('error', reject)
            .on('end', resolve);
    });
}

export function localize(language_code: string, string_id: string, view: Record<string, string>): string {
    const localization_string = localization[string_id]?.[language_code];
    if (!localization_string) return `${string_id.toUpperCase()}: ${JSON.stringify(view)}`;

    return Mustache.render(localization_string, view);
}