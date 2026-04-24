import { 
  Component, OnInit, Input, Output, EventEmitter, 
  OnChanges, SimpleChanges, ViewChild, ElementRef, 
  Renderer2, AfterViewInit 
} from '@angular/core';
import { DadosIndice, MunicipioMapa } from '../../models/dados-lgpd-jurisdicionado';
import { CORES_FAIXAS, COR_PADRAO } from './models/cores-faixas.const';

@Component({
  selector: 'app-mapa-ms',
  templateUrl: './mapa-ms.component.html',
  styleUrls: ['./mapa-ms.component.scss']
})
export class MapaMsComponent implements OnInit, OnChanges, AfterViewInit {

  @Input() DadosIndice: DadosIndice[] = [];
  @Input() grupoSelecionado!: string;
  @Input() grupoHover: string | null = null;
  @Input() tipo: 'PREFEITURAS' | 'CÂMARAS' = 'PREFEITURAS'; // Novo input para tipo

  @Output() municipioHover = new EventEmitter<MunicipioMapa | null>();
  @Output() municipioSelecionado = new EventEmitter<MunicipioMapa>();

  @ViewChild('svgMapa', { static: false }) svgMapa!: ElementRef;

  municipiosProcessados: Map<string, MunicipioMapa> = new Map();
  private municipioAtualSelecionado: string | null = null;

  // Dados do tooltip
  tooltipVisivel = false;
  tooltipX = 0;
  tooltipY = 0;
  tooltipData: MunicipioMapa | null = null;
  municipioHoverAtual: string | null = null;

  constructor(private renderer: Renderer2) { }

  ngOnChanges(changes: SimpleChanges): void {
    // Se os dados ou o tipo mudaram, reprocessa
    if ((changes['DadosIndice'] || changes['tipo']) && this.DadosIndice?.length > 0) {
      this.processarDados();
      setTimeout(() => {
        this.aplicarCores();
      });
    }
    
    // Quando o grupoHover muda, aplica ou remove o destaque
    if (changes['grupoHover']) {
      setTimeout(() => {
        if (this.grupoHover) {
          this.aplicarHoverGrupo(this.grupoHover);
        } else {
          this.removerHoverGrupo();
        }
      });
    }
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    this.aplicarCores();
  }

  private normalizarNome(nome: string): string {
    if (!nome) return '';
    return nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .trim();
  }

  private processarDados(): void {
    this.municipiosProcessados.clear();

    if (!this.DadosIndice?.length) return;

    const dadosPorMunicipio = new Map<string, DadosIndice[]>();

    this.DadosIndice.forEach(dado => {
      // Filtra pelo tipo (PREFEITURAS ou CÂMARAS)
      if (dado.tipo_ug !== this.tipo) return;

      const nomeMunicipio = dado.ua_nome || dado.municipio || '';
      if (!nomeMunicipio) return;

      const id = this.normalizarNome(nomeMunicipio);
      
      if (!dadosPorMunicipio.has(id)) {
        dadosPorMunicipio.set(id, []);
      }
      
      dadosPorMunicipio.get(id)!.push(dado);
    });

    dadosPorMunicipio.forEach((dados, id) => {
      const grupoPredominante = this.calcularGrupoPredominante(dados);
      const nomeMunicipio = dados[0].ua_nome || dados[0].municipio || '';

      this.municipiosProcessados.set(id, {
        id,
        nome: nomeMunicipio,
        faixa: grupoPredominante,
        cor: this.obterCorPorGrupo(grupoPredominante),
        dados: dados.map(d => ({
          ...d,
          municipio: nomeMunicipio,
          grupo: d.grupo?.trim().toUpperCase() || '',
          nota: this.converterNota(d.nota)
        }))
      });
    });
  }

  private calcularGrupoPredominante(dados: DadosIndice[]): string {
    if (!dados || dados.length === 0) return 'SEM_DADOS';

    // Contar ocorrências de cada grupo
    const contagemGrupos = new Map<string, number>();
    const notasPorGrupo = new Map<string, number[]>();

    dados.forEach(item => {
      const grupo = item.grupo?.trim().toUpperCase() || '';
      if (!grupo) return;

      contagemGrupos.set(grupo, (contagemGrupos.get(grupo) || 0) + 1);

      const nota = this.converterNota(item.nota);
      if (nota > 0) {
        if (!notasPorGrupo.has(grupo)) {
          notasPorGrupo.set(grupo, []);
        }
        notasPorGrupo.get(grupo)!.push(nota);
      }
    });

    if (contagemGrupos.size === 0) return 'SEM_DADOS';

    // Se há notas válidas, usar grupo com maior média
    if (notasPorGrupo.size > 0) {
      let melhorGrupo = '';
      let maiorMedia = 0;

      notasPorGrupo.forEach((notas, grupo) => {
        const media = notas.reduce((a, b) => a + b, 0) / notas.length;
        if (media > maiorMedia) {
          maiorMedia = media;
          melhorGrupo = grupo;
        }
      });

      return melhorGrupo;
    }

    // Se não há notas válidas, usar grupo mais frequente
    let grupoMaisFrequente = '';
    let maiorContagem = 0;

    contagemGrupos.forEach((count, grupo) => {
      if (count > maiorContagem) {
        maiorContagem = count;
        grupoMaisFrequente = grupo;
      }
    });

    return grupoMaisFrequente;
  }

  private converterNota(nota: string | number): number {
    if (nota === null || nota === undefined) return 0;

    if (typeof nota === 'number') return nota;

    const notaStr = String(nota).trim();

    if (notaStr === 'R/N' || notaStr === 'Estado' || notaStr === 'Z' || notaStr === '') {
      return 0;
    }

    const notaNumerica = parseFloat(notaStr.replace(',', '.'));
    return isNaN(notaNumerica) ? 0 : notaNumerica;
  }

  private obterCorPorGrupo(grupo: string | null | undefined): string {
    if (!grupo) {
      return COR_PADRAO;
    }

    const grupoNormalizado = grupo.trim().toUpperCase();

    return CORES_FAIXAS[grupoNormalizado] || COR_PADRAO;
  }

  private aplicarCores(): void {
    if (!this.svgMapa) {
      return;
    }

    const svg = this.svgMapa.nativeElement;
    const todosMunicipiosPaths = svg.querySelectorAll('path[id]');

    todosMunicipiosPaths.forEach((path: SVGPathElement) => {
      const idNormalizado = this.normalizarNome(path.id);
      const municipio = this.municipiosProcessados.get(idNormalizado);

      this.renderer.removeStyle(path, 'fill');
      this.renderer.removeClass(path, 'has-data');
      this.renderer.removeClass(path, 'no-data');

      if (municipio && municipio.dados.length > 0) {
        this.renderer.setStyle(path, 'fill', municipio.cor);
        this.renderer.setStyle(path, 'cursor', 'pointer');
        this.renderer.setAttribute(path, 'data-municipio', municipio.nome);
        this.renderer.setAttribute(path, 'data-grupo', municipio.faixa);
        this.renderer.addClass(path, 'has-data');
      } else {
        this.renderer.setAttribute(path, 'fill', 'url(#diagonal-stripes)');
        this.renderer.setStyle(path, 'cursor', 'pointer');
        this.renderer.setAttribute(path, 'data-municipio', idNormalizado);
        this.renderer.setAttribute(path, 'data-grupo', 'SEM_NOTA');
        this.renderer.addClass(path, 'no-data');
      }
    });
  }

  onMunicipioClick(event: MouseEvent): void {
    const target = event.target as SVGPathElement;

    if (!target.id) return;

    const municipioId = this.normalizarNome(target.id);
    const municipio = this.municipiosProcessados.get(municipioId);

    if (!municipio) return;

    // Filtrar dados pelo grupo selecionado
    const dadosDoGrupo = this.grupoSelecionado
      ? municipio.dados.filter(d => d.grupo === this.grupoSelecionado)
      : municipio.dados;

    if (dadosDoGrupo.length === 0) {
      return;
    }

    // Remove seleção anterior
    if (this.municipioAtualSelecionado) {
      const pathAnterior = this.svgMapa.nativeElement.querySelector(
        `#${this.municipioAtualSelecionado}`
      );
      if (pathAnterior) {
        this.renderer.removeClass(pathAnterior, 'selected');
      }
    }

    // Nova seleção
    this.municipioAtualSelecionado = municipioId;
    this.renderer.addClass(target, 'selected');

    // Emitir apenas dados do grupo
    this.municipioSelecionado.emit({
      ...municipio,
      dados: dadosDoGrupo
    });
  }

  onMunicipioHover(event: MouseEvent): void {
    const target = event.target as SVGElement;

    if (!target.id || target.tagName.toLowerCase() !== 'path') {
      this.esconderTooltip();
      this.removerHoverGrupo();
      return;
    }

    const municipioId = this.normalizarNome(target.id);
    const municipio = this.municipiosProcessados.get(municipioId);

    // Atualizar município atual sob o mouse
    this.onMunicipioMouseMove(event);

    if (municipio) {
      this.aplicarHoverGrupo(municipio.faixa);
      this.mostrarTooltip(event, municipio);
      this.municipioHover.emit(municipio);
    } else {
      this.removerHoverGrupo();
      const municipioSemNota: MunicipioMapa = {
        id: municipioId,
        nome: this.normalizarNome(municipioId),
        faixa: 'SEM_NOTA',
        cor: 'url(#diagonal-stripes)',
        dados: []
      };
      this.mostrarTooltip(event, municipioSemNota);
      this.municipioHover.emit(null);
    }
  }

  onMouseLeave(): void {
    this.esconderTooltip();
    this.removerHoverGrupo();
    this.municipioHover.emit(null);
  }

  private mostrarTooltip(event: MouseEvent, municipio: MunicipioMapa): void {
    this.tooltipVisivel = true;
    this.tooltipData = municipio;
    
    const offsetX = 15;
    const offsetY = 15;
    const windowHeight = window.innerHeight;
    const mouseY = event.clientY;
    
    if (mouseY > windowHeight / 2) {
      this.tooltipX = event.clientX + offsetX;
      this.tooltipY = event.clientY - 400;
    } else {
      this.tooltipX = event.clientX + offsetX;
      this.tooltipY = event.clientY + offsetY;
    }
  }

  private esconderTooltip(): void {
    this.tooltipVisivel = false;
    this.tooltipData = null;
    this.municipioHoverAtual = null;
  }

  getMunicipiosDoGrupo(grupo: string): string[] {
    if (!grupo || grupo === 'SEM_NOTA') return [];
    
    const municipios: string[] = [];
    
    this.municipiosProcessados.forEach((municipio) => {
      if (municipio.faixa === grupo && municipio.dados.length > 0) {
        const isTipoCorreto = municipio.dados.some(d => d.tipo_ug === this.tipo);
        if (isTipoCorreto) {
          municipios.push(municipio.nome);
        }
      }
    });
    
    return municipios.sort((a, b) => a.localeCompare(b));
  }

  onMunicipioMouseMove(event: MouseEvent): void {
    const target = event.target as SVGElement;
    
    if (!target.id || target.tagName.toLowerCase() !== 'path') {
      this.municipioHoverAtual = null;
      return;
    }
    
    const municipioId = this.normalizarNome(target.id);
    const municipio = this.municipiosProcessados.get(municipioId);
    
    if (municipio) {
      this.municipioHoverAtual = municipio.nome;
    } else {
      this.municipioHoverAtual = null;
    }
  }

  getNumeroAreas(municipio: MunicipioMapa): number {
    if (this.grupoSelecionado) {
      return municipio.dados.filter(d => d.grupo === this.grupoSelecionado).length;
    }
    return municipio.dados.length;
  }

  private aplicarHoverGrupo(grupo: string): void {
    if (!this.svgMapa || !grupo || grupo === 'SEM_NOTA') return;

    const svg = this.svgMapa.nativeElement;
    const todosPaths = svg.querySelectorAll('path[id]');

    todosPaths.forEach((path: SVGPathElement) => {
      const idNormalizado = this.normalizarNome(path.id);
      const municipio = this.municipiosProcessados.get(idNormalizado);

      if (municipio && municipio.faixa === grupo) {
        this.renderer.addClass(path, 'grupo-hover');
      }
    });
  }

  private removerHoverGrupo(): void {
    if (!this.svgMapa) return;

    const svg = this.svgMapa.nativeElement;
    const todosPaths = svg.querySelectorAll('path[id]');

    todosPaths.forEach((path: SVGPathElement) => {
      this.renderer.removeClass(path, 'grupo-hover');
    });
  }
}