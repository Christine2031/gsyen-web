import { Phone, Mail } from 'lucide-react';

export type ContactType = 'client' | 'supplier' | 'partner';
export type ContactStatus = 'active' | 'inactive';

export interface Contact {
  id: string;
  name: string;
  company: string;
  type: ContactType;
  status: ContactStatus;
  phone: string;
  email: string;
  location: string;
  notes?: string;
}

export const TYPE_CFG: Record<ContactType, { zh: string; en: string; cls: string }> = {
  client:   { zh: '客户',   en: 'Client',   cls: 'bg-[#E8F0FE] text-[#1A73E8]' },
  supplier: { zh: '供应商', en: 'Supplier', cls: 'bg-[#E6F4EA] text-[#137333]' },
  partner:  { zh: '合作方', en: 'Partner',  cls: 'bg-[#FEF7E0] text-[#B05E00]' },
};

export const STATUS_CFG: Record<ContactStatus, { zh: string; en: string; cls: string }> = {
  active:   { zh: '活跃', en: 'Active',   cls: 'bg-[#E6F4EA] text-[#137333]' },
  inactive: { zh: '停用', en: 'Inactive', cls: 'bg-[#F1F3F4] text-[#5F6368]' },
};

const AVATAR_COLORS = [
  'bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]',
  'bg-[#9334E6]', 'bg-[#D93025]', 'bg-[#0097A7]',
];

export function ContactRow({ c, lang }: { c: Contact; lang: 'zh' | 'en' }) {
  const zh = lang === 'zh';
  const avatarCls = AVATAR_COLORS[c.name.charCodeAt(0) % AVATAR_COLORS.length];
  const typeCfg   = TYPE_CFG[c.type];
  const statusCfg = STATUS_CFG[c.status];

  return (
    <tr className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors">
      <td className="py-3.5 pl-6 pr-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${avatarCls} flex items-center justify-center shrink-0`}>
            <span className="text-white text-(--fs-base) font-bold font-sans">{c.name.charAt(0)}</span>
          </div>
          <div>
            <p className="text-(--fs-body) font-medium text-[#202124] font-sans">{c.name}</p>
            <p className="text-(--fs-md) text-[#5F6368] font-sans">{c.company}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-3">
        <p className="text-(--fs-base) text-[#5F6368] font-sans">{c.location}</p>
        {c.notes && <p className="text-(--fs-md) text-[#9AA0A6] font-sans truncate max-w-[160px]">{c.notes}</p>}
      </td>
      <td className="py-3.5 px-3">
        <div className="flex items-center gap-1.5 text-(--fs-base) text-[#5F6368] font-sans">
          <Phone className="w-3 h-3 text-[#9AA0A6]" strokeWidth={1.5} />
          {c.phone}
        </div>
        <div className="flex items-center gap-1.5 text-(--fs-md) text-[#9AA0A6] font-sans mt-0.5">
          <Mail className="w-3 h-3" strokeWidth={1.5} />
          {c.email}
        </div>
      </td>
      <td className="py-3.5 px-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-(--fs-md) font-medium font-sans ${typeCfg.cls}`}>
          {zh ? typeCfg.zh : typeCfg.en}
        </span>
      </td>
      <td className="py-3.5 pl-3 pr-6">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-(--fs-md) font-medium font-sans ${statusCfg.cls}`}>
          {zh ? statusCfg.zh : statusCfg.en}
        </span>
      </td>
    </tr>
  );
}
