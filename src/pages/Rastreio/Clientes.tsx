import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import { mensagemErro } from './api';
import './Rastreio.css';

/**
 * Nome dos clientes. O XML do Metrics traz so o numero (IdActorCustomer), e a
 * importacao cria o cliente sem nome. Aqui o PCP da o nome uma vez por
 * cliente, e ele passa a sair na etiqueta de palete, na ficha e no painel.
 * Escrita so para a conta de administracao (politica de rast_clientes).
 */

interface ClienteLinha {
    id: number;
    nome: string | null;
    ops: number;
    exemplo: string | null;
}

const Clientes: React.FC = () => {
    const { showSuccess, showError } = useToast();
    const [clientes, setClientes] = useState<ClienteLinha[]>([]);
    const [nomes, setNomes] = useState<Record<number, string>>({});
    const [salvando, setSalvando] = useState<number | null>(null);

    const carregar = async () => {
        try {
            const [cli, ops] = await Promise.all([
                supabase.from('rast_clientes').select('id, nome').order('id'),
                supabase.from('rast_ops').select('cliente_id, descricao, importado_em')
                    .eq('ativa', true).not('cliente_id', 'is', null)
                    .order('importado_em', { ascending: false }),
            ]);
            if (cli.error) throw cli.error;
            if (ops.error) throw ops.error;

            const linhas = (cli.data || []).map((c: { id: number; nome: string | null }) => {
                const daqui = (ops.data || []).filter((o: { cliente_id: number | null }) => o.cliente_id === c.id);
                return {
                    id: c.id,
                    nome: c.nome,
                    ops: daqui.length,
                    exemplo: (daqui[0] as { descricao: string | null } | undefined)?.descricao ?? null,
                };
            });
            // Sem nome primeiro: e o que falta fazer.
            linhas.sort((a, b) => Number(!!a.nome) - Number(!!b.nome) || b.ops - a.ops || a.id - b.id);
            setClientes(linhas);
            setNomes(Object.fromEntries(linhas.map(l => [l.id, l.nome ?? ''])));
        } catch (err) {
            showError(mensagemErro(err));
        }
    };

    useEffect(() => { carregar(); }, []);

    const salvar = async (c: ClienteLinha) => {
        const nome = (nomes[c.id] ?? '').trim();
        setSalvando(c.id);
        try {
            const { error } = await supabase.from('rast_clientes').update({ nome: nome || null }).eq('id', c.id);
            if (error) throw error;
            showSuccess(nome ? `Cliente ${c.id}: ${nome}.` : `Cliente ${c.id} ficou sem nome.`);
            await carregar();
        } catch (err) {
            showError(mensagemErro(err));
        } finally {
            setSalvando(null);
        }
    };

    const semNome = clientes.filter(c => !c.nome).length;

    return (
        <div className="rast-card">
            <h2>Clientes</h2>
            <p className="rast-ajuda" style={{ marginBottom: 16 }}>
                O XML do Metrics traz só o número do cliente, nunca o nome. Dê o nome uma vez aqui e ele passa a sair na
                etiqueta de palete, na ficha do palete e no Painel por OP.
                {semNome > 0 && <> <b>{semNome} cliente(s) sem nome.</b></>}
            </p>
            {clientes.length === 0 ? (
                <div className="rast-vazio">Nenhum cliente ainda. Eles aparecem aqui quando uma OP é importada.</div>
            ) : (
                <div className="rast-tabela-wrap">
                    <table className="rast-tabela">
                        <thead>
                            <tr>
                                <th>Nº no Metrics</th>
                                <th>Nome</th>
                                <th style={{ textAlign: 'right' }}>OPs</th>
                                <th>Produto de exemplo</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientes.map(c => (
                                <tr key={c.id}>
                                    <td className="rast-codigo">{c.id}</td>
                                    <td style={{ minWidth: 220 }}>
                                        <input
                                            className="rast-input"
                                            value={nomes[c.id] ?? ''}
                                            placeholder="Ex.: Boticário"
                                            aria-label={`Nome do cliente ${c.id}`}
                                            onChange={e => setNomes({ ...nomes, [c.id]: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') salvar(c); }}
                                        />
                                    </td>
                                    <td className="num">{c.ops}</td>
                                    <td className="rast-ajuda" style={{ maxWidth: 360 }}>{c.exemplo || '—'}</td>
                                    <td>
                                        {(nomes[c.id] ?? '') !== (c.nome ?? '') && (
                                            <button className="rast-btn pequeno" disabled={salvando === c.id} onClick={() => salvar(c)}>
                                                <Save size={14} /> {salvando === c.id ? 'Salvando...' : 'Salvar'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Clientes;
