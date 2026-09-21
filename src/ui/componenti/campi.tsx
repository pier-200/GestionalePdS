import { NumberInput, TextInput, type NumberInputProps, type TextInputProps } from '@mantine/core';
import { DateInput, type DateInputProps } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { dataDaFormatoItaliano, isDataISO } from '../../domain/date';
import { valoreImportoDaInput } from '../../domain/importi';
import type { Centesimi, DataISO } from '../../domain/tipi';

type PropsImporto = Omit<NumberInputProps, 'value' | 'onChange' | 'defaultValue'> & {
  value: Centesimi | null;
  onChange: (valore: Centesimi | null) => void;
};

/** Campo importo in euro (formato italiano), con valore in centesimi. */
export function CampoImporto({ value, onChange, ...props }: PropsImporto) {
  return (
    <NumberInput
      value={value == null ? '' : value / 100}
      onChange={(v) => onChange(valoreImportoDaInput(v))}
      decimalSeparator=","
      thousandSeparator="."
      decimalScale={2}
      fixedDecimalScale
      allowNegative={false}
      allowedDecimalSeparators={[',', '.']}
      hideControls
      suffix=" €"
      inputMode="decimal"
      classNames={{ input: 'num' }}
      max={9_999_999_999_999.99}
      {...props}
    />
  );
}

type PropsProtocollo = Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string | null;
  onChange: (valore: string | null) => void;
};

/**
 * Numero di protocollo: si digita solo il numero (gli zeri iniziali restano).
 * La data del protocollo è il campo data che accompagna la sezione.
 */
export function CampoProtocollo({ value, onChange, ...props }: PropsProtocollo) {
  return (
    <TextInput
      value={value ?? ''}
      onChange={(e) => onChange(e.currentTarget.value.replace(/\D/g, '') || null)}
      inputMode="numeric"
      placeholder="es. 0089567"
      maxLength={20}
      classNames={{ input: 'num' }}
      {...props}
    />
  );
}

type PropsData = Omit<DateInputProps, 'value' | 'onChange'> & {
  value: DataISO | null;
  onChange: (valore: DataISO | null) => void;
};

/** Campo data in formato gg/mm/aaaa, con valore ISO `YYYY-MM-DD`. */
export function CampoData({ value, onChange, ...props }: PropsData) {
  return (
    <DateInput
      value={value}
      onChange={(v) => onChange(v && isDataISO(v.slice(0, 10)) ? v.slice(0, 10) : null)}
      valueFormat="DD/MM/YYYY"
      dateParser={(testo) => dataDaFormatoItaliano(testo) ?? (isDataISO(testo) ? testo : null)}
      placeholder="gg/mm/aaaa"
      clearable
      leftSection={<IconCalendar size={16} stroke={1.6} />}
      leftSectionPointerEvents="none"
      popoverProps={{ withinPortal: true }}
      {...props}
    />
  );
}
