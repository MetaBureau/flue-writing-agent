import { sqlite } from '@flue/runtime/node';
import { flueSqliteFile } from './essay_kv.ts';

export default sqlite(flueSqliteFile());
