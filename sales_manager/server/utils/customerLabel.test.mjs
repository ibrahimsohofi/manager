import { parseCustomerLabel } from './customerLabel.js';

const samples = [
  '1234', 'N° 1234', 'n°1234', '#1234', 'No 1234', 'Num 1234', 'رقم 1234', 'C-102',
  '06 12 34 56 78', 'Ahmed', 'moul taxi', 'Ahmed 2', 'Ahmed2', 'Client 55', 'no limit',
  'Nora', '5', 'CL102', '12/7', 'Noé 3', 'client 1 femme', 'Nº 77', 'num 9',
];
for (const s of samples) console.log(JSON.stringify(s).padEnd(22), JSON.stringify(parseCustomerLabel(s)));
