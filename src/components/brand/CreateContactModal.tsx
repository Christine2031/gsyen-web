interface Props {
  zh: boolean;
  createType: 'contact' | 'team' | null;
  contactEmail: string;
  contactName: string;
  onSetCreateType: (type: 'contact' | 'team' | null) => void;
  onSetContactEmail: (email: string) => void;
  onSetContactName: (name: string) => void;
}

export function CreateContactModal({ zh, createType, contactEmail, contactName, onSetCreateType, onSetContactEmail, onSetContactName }: Props) {
  if (createType !== 'contact') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/5" onClick={() => onSetCreateType(null)}>
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold text-[#202124] mb-8 font-sans">{zh ? '添加联系人' : 'Add Contact'}</h2>

        <input
          type="email"
          value={contactEmail}
          onChange={e => onSetContactEmail(e.target.value)}
          placeholder={zh ? '输入邮箱地址' : 'Enter email address'}
          className="w-full px-4 py-3 rounded-lg border border-[#DADCE0] text-(--fs-body) focus:outline-none focus:border-[#1A73E8] mb-8 font-sans"
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => { onSetCreateType(null); onSetContactName(''); onSetContactEmail(''); }}
            className="px-5 py-2 rounded-lg text-(--fs-body) font-medium text-[#5F6368] hover:bg-[#F1F3F4] font-sans">
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={() => { onSetCreateType(null); onSetContactName(''); onSetContactEmail(''); }}
            className="px-6 py-2 rounded-lg text-(--fs-body) font-medium bg-[#1A73E8] text-white hover:bg-[#1557B0] font-sans">
            {zh ? '邀请' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}
