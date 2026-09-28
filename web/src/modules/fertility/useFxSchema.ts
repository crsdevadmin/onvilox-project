import { useAsync } from '../../core/useAsync';
import { fertilityApi } from './api';

/** The assessment data dictionary, fetched once per page load. */
export const useFxSchema = () => useAsync(fertilityApi.schema, []);
