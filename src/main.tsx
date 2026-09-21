import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './ui/stili.css';

import dayjs from 'dayjs';
import 'dayjs/locale/it';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

dayjs.extend(customParseFormat);
dayjs.locale('it');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
