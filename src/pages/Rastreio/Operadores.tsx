import React, { useEffect, useState } from 'react';
import { Plus, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import type { Operador, Papel, Setor } from './api';
import { PAPEL_LABEL, listarSetores, mensagemErro } from './api';
import Clientes from './Clientes';
import './Rastreio.css';

const Operadores: React.FC = () => {
    const { showSuccess, showError } = useToast();
    const [operadores, setOperadores] = useState<Operador[]>([]);
    const [setores, setSetores] = useState<Setor[]>([]);
    const [erro, setErro] = useState<string | null>(null);
    const [novo, setNovo] = useState({ matricula: '', nome: '', setor_id: '', papel: 'operador' as Papel });
    const [curas, setCuras] = useState<Record<number, string>>({});

    const carregar = async () => {
        try {
            const [{ data, error }, s] = await Promise.all([
                supabase.from('rast_operadores').select('*').order('nome'),
                listarSetores(),
            ]);
            if (error) throw error;
            setOperadores((data || []) as Operador[]);
            setSetores(s);
            setCuras(Object.fromEntries(s.map(x => [x.id, String(x.cura_horas)])));
        } catch (e) {
            setErro(mensagemErro(e));
        }
    };

    useEffect(() => { carregar(); }, []);

    const adicionar = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('rast_operadores').insert({
            matricula: novo.matricula.trim(),
            nome: novo.nome.trim(),
            setor_id: novo.setor_id ? Number(novo.setor_id) : null,
            papel: novo.papel,
        });
        if (error) {
            showError(error.code === '23505' ? `A matrícula ${novo.matricula} já está cadastrada.` : mensagemErro(error));
            return;
        }
        showSuccess(`${novo.nome} cadastrado.`);
        setNovo({ matricula: '', nome: '', setor_id: '', papel: 'operador' });
        carregar();
    };

    const trocarPapel = async (o: Operador, papel: Papel) => {
        const { error } = await supabase.from('rast_operadores').update({ papel }).eq('id', o.id);
        if (error) { showError(mensagemErro(error)); return; }
        showSuccess(`${o.nome}: ${PAPEL_LABEL[papel].toLowerCase()}.`);
        carregar();
    };

    const alternarAtivo = async (o: Operador) => {
        const { error } = await supabase.from('rast_operadores').update({ ativo: !o.ativo }).eq('id', o.id);
        if (error) { showError(mensagemErro(error)); return; }
        carregar();
    };

    const salvarCura = async (s: Setor) => {
        const horas = Number(curas[s.id]?.replace(',', '.'));
        if (!Number.isFinite(horas) || horas < 0) { showError('Informe as horas de cura (0 para sem cura).'); return; }
        const { error } = await supabase.from('rast_setores').update({ cura_horas: horas }).eq('id', s.id);
        if (error) { showError(mensagemErro(error)); return; }
        showSuccess(`Cura de ${s.nome}: ${horas} h. Vale para os paletes criados daqui para frente.`);
        carregar();
    };

    return (
        <div className="rast-page">
            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            <div className="rast-card">
                <h2>Operadores</h2>
                <p className="rast-ajuda" style={{ marginBottom: 16 }}>
                    A matrícula é o que o operador digita ou bipa do crachá ao criar e ao baixar palete. Fica gravada em cada movimento.
                    Todos criam palete, bipam e reimprimem ficha. <b>Só líder e supervisor cancelam palete</b>, porque cancelar devolve o
                    material ao saldo do setor e some com uma ficha que já está no chão.
                </p>
                <form className="rast-linha" onSubmit={adicionar} style={{ marginBottom: 20 }}>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-o-mat">Matrícula</label>
                        <input id="rast-o-mat" required value={novo.matricula} onChange={e => setNovo({ ...novo, matricula: e.target.value })} />
                    </div>
                    <div className="rast-campo">
                        <label htmlFor="rast-o-nome">Nome</label>
                        <input id="rast-o-nome" required value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} />
                    </div>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-o-setor">Setor</label>
                        <select id="rast-o-setor" value={novo.setor_id} onChange={e => setNovo({ ...novo, setor_id: e.target.value })}>
                            <option value="">-</option>
                            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                    </div>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-o-papel">Papel</label>
                        <select id="rast-o-papel" value={novo.papel} onChange={e => setNovo({ ...novo, papel: e.target.value as Papel })}>
                            <option value="operador">Operador</option>
                            <option value="lider">Líder de setor</option>
                            <option value="supervisor">Supervisor</option>
                        </select>
                    </div>
                    <button className="rast-btn primario" type="submit"><Plus size={18} /> Cadastrar</button>
                </form>

                {operadores.length === 0 ? (
                    <div className="rast-vazio">Nenhum operador cadastrado. Cadastre antes de criar o primeiro palete.</div>
                ) : (
                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead><tr><th>Matrícula</th><th>Nome</th><th>Setor</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
                            <tbody>
                                {operadores.map(o => (
                                    <tr key={o.id} className={o.ativo ? '' : 'apagada'}>
                                        <td className="rast-codigo">{o.matricula}</td>
                                        <td>{o.nome}</td>
                                        <td>{setores.find(s => s.id === o.setor_id)?.nome ?? '-'}</td>
                                        <td>
                                            <select value={o.papel} aria-label={`Papel de ${o.nome}`}
                                                onChange={e => trocarPapel(o, e.target.value as Papel)}>
                                                <option value="operador">Operador</option>
                                                <option value="lider">Líder de setor</option>
                                                <option value="supervisor">Supervisor</option>
                                            </select>
                                        </td>
                                        <td><span className={`rast-badge ${o.ativo ? 'consumido' : 'cancelado'}`}>{o.ativo ? 'Ativo' : 'Inativo'}</span></td>
                                        <td><button className="rast-btn pequeno" onClick={() => alternarAtivo(o)}>{o.ativo ? 'Inativar' : 'Reativar'}</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="rast-card">
                <h2>Setores e cura</h2>
                <p className="rast-ajuda" style={{ marginBottom: 16 }}>
                    A cura é contada a partir da hora em que o palete é registrado. Só a impressão tem cura (12 h).
                    Mudar aqui vale para os paletes novos; os que já existem mantêm a hora de liberação da ficha.
                </p>
                <div className="rast-tabela-wrap">
                    <table className="rast-tabela">
                        <thead><tr><th>Setor</th><th>Sigla</th><th>Reconhece no Metrics</th><th>Cura (horas)</th><th></th></tr></thead>
                        <tbody>
                            {setores.map(s => (
                                <tr key={s.id}>
                                    <td><b>{s.nome}</b></td>
                                    <td className="rast-codigo">{s.sigla}</td>
                                    <td className="rast-ajuda">{s.terceiros ? 'processos marcados como terceiros' : s.palavras_chave.join(', ')}</td>
                                    <td style={{ width: 120 }}>
                                        <input className="rast-input" inputMode="decimal" value={curas[s.id] ?? ''} aria-label={`Cura de ${s.nome}`}
                                            onChange={e => setCuras({ ...curas, [s.id]: e.target.value })} />
                                    </td>
                                    <td>
                                        {String(s.cura_horas) !== curas[s.id] && (
                                            <button className="rast-btn pequeno" onClick={() => salvarCura(s)}><Save size={14} /> Salvar</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Clientes />
        </div>
    );
};

export default Operadores;
