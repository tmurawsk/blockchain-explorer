import React, { Component } from 'react';
import _ from 'lodash';
import { select } from 'd3-selection';
import { forceSimulation, forceManyBody, forceLink, forceCenter } from 'd3-force';

import './Graph.css';

const BASE_RADIUS = 10;
const ARROW_SIZE = 5;
const CHARGE_STRENGTH = -30;
const SHORT_ADDRESS_LENGTH = 6;
const VALUE_DECIMAL_PLACES = 4;
const LABEL = { WIDTH: 60, OFFSET: 20};
const GRAPH_TYPES = { INCOMING: 'incoming', OUTGOING: 'outgoing'};
const MINED_ADDRESS = 'MINED';

class Graph extends Component {
    reduceDuplications = (prev, curr) => {
        const duplicated = prev.find(({address}) => address === curr.address);

        return duplicated ? prev : prev.concat(curr);
    };

    getTicked = (links, nodes) => (() => {
        links.attr('d', ({ target, source }) => {
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dr = Math.sqrt(dx * dx + dy * dy);

            return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
        });

        nodes.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    getSize = (val) => Math.log(val + 2) * BASE_RADIUS;

    getDirection = (type) => type === GRAPH_TYPES.INCOMING ? 'from' : 'to';

    getShortAddress = (address) =>
        address === MINED_ADDRESS ? MINED_ADDRESS : address.substring(0, SHORT_ADDRESS_LENGTH).concat('...');

    showTooltip = ({ x, y, size, address, transactions }, width, height) => {
        this.hideTooltip();

        const tooltip = select('.graph')
            .insert('div')
            .attr('class', 'tooltip');

        tooltip.append('h3')
            .attr('class', 'title')
            .text(address);

        const wrapper = tooltip
            .append('div')
            .attr('class', 'transactions__wrapper');

        wrapper
            .append('div')
            .attr('class', 'transactions--incoming')
            .append('h4')
            .text(_.capitalize(GRAPH_TYPES.INCOMING));
        wrapper
            .append('div')
            .attr('class', 'transactions--outgoing')
            .append('h4')
            .text(_.capitalize(GRAPH_TYPES.OUTGOING));

        transactions.forEach(({ value, type, address }) => {
            const container = tooltip
                .select('.transactions__wrapper')
                .select(`.transactions--${type}`);

            container
                .append('p')
                .text(`${value} Ether ${this.getDirection(type)} ${this.getShortAddress(address)}`);
        });

        const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
        const horizontalPosition = x + size + tooltipWidth < width ? x + size : x - tooltipWidth - size;
        const verticalPosition = y + size + tooltipHeight < height ? y + size : y - tooltipHeight - size;

        tooltip.style('left', `${horizontalPosition}px`).style('top', `${verticalPosition}px`);
    };

    hideTooltip = () => select('.graph').select('.tooltip').remove();

    renderGraph = () => {
        const { address, inTransactions, outTransactions, onClick, mined } = this.props;
        const svg = select('.graph').append('svg').on('click', () => this.hideTooltip());
        const { width, height } = svg.node().getBoundingClientRect();
        const side = Math.min(width, height);
        const offsetWidth = (width - side) / 2;
        const offsetHeight = (height - side) / 2;
        const simulation = forceSimulation()
            .force('charge', forceManyBody().strength(CHARGE_STRENGTH))
            .force('link', forceLink().id((d) => d.address).distance(side / 3))
            .force('center', forceCenter(side / 2 + offsetWidth, side / 2 + offsetHeight));

        svg.append("defs")
            .selectAll("marker")
            .data(["arrow"])
            .enter()
            .append("marker")
            .attr("id", String)
            .attr("viewBox", "0 -5 10 10")
            .attr("markerWidth", ARROW_SIZE)
            .attr("markerHeight", ARROW_SIZE)
            .attr("orient", "auto")
            .attr('class', 'arrow')
            .append("path")
            .attr("d", "M0,-5L10,0L0,5");

        const inLinks = inTransactions.map((transaction) =>
            ({ source: transaction.address, target: address, type: GRAPH_TYPES.INCOMING, value: transaction.value }));
        const outLinks = outTransactions.map((transaction) =>
            ({ source: address, target: transaction.address, type: GRAPH_TYPES.OUTGOING, value: transaction.value }));
        let links = [...inLinks, ...outLinks];

        const fromNodes = inTransactions.map((node) =>
            ({ ...node, x: offsetWidth, y: side / 2 + offsetHeight }));
        const centerNode = { address, x: side / 2 + offsetWidth, y: side / 2 + offsetHeight, current: true };
        const toNodes = outTransactions.map((node) =>
            ({ ...node, x: side - offsetWidth, y: side / 2 + offsetHeight }));
        let nodes = [...fromNodes, centerNode, ...toNodes].reduce(this.reduceDuplications, []);

        if (mined) {
            const minedLink = { source: MINED_ADDRESS, target: address, type: GRAPH_TYPES.INCOMING, value: mined };
            const minedNode = { address: MINED_ADDRESS, x: side / 2, y: side + offsetHeight, mined: true };

            links = links.concat(minedLink);
            nodes = nodes.concat(minedNode);
        }

        links.forEach((link) => {
            const { value, source: sourceAddress, target: targetAddress } = link;
            const source = nodes.find((node) => node.address === sourceAddress);
            const sourceTransaction =
                { value: value.toFixed(VALUE_DECIMAL_PLACES), type: GRAPH_TYPES.OUTGOING, address: targetAddress };
            const target = nodes.find((node) => node.address === targetAddress);
            const targetTransaction =
                { value: value.toFixed(VALUE_DECIMAL_PLACES), type: GRAPH_TYPES.INCOMING, address: sourceAddress };

            source.transactions = source.transactions ?
                source.transactions.concat(sourceTransaction) : [].concat(sourceTransaction);
            target.transactions = target.transactions ?
                target.transactions.concat(targetTransaction) : [].concat(targetTransaction);
        });

        nodes.map((node) => {
            node.transactions = node.transactions ? node.transactions : [];
            node.size = this.getSize(node.transactions.length);

            return node;
        });

        const selectedLinks = svg
            .selectAll('.link')
            .data(links)
            .enter()
            .append('path')
            .attr('class', (d) => `link ${d.type}`)
            .attr('marker-mid', 'url(#arrow)');

        const selectedNodes = svg
            .selectAll('.node')
            .data(nodes)
            .enter()
            .append('g')
            .on('click', (d) => onClick(d.address))
            .on('mouseover', (d) => this.showTooltip(d, width, height))
            .attr('class', (d) => {
                if (d.current) {
                    return 'node node--current';
                } else if (d.mined) {
                    return 'node node--mined';
                }

                return 'node';
            });

        selectedNodes.append('circle').attr('r', (d) => d.size).style('stroke-width', (d) => d.current ? d.size / 3 : '');
        selectedNodes.append('text')
            .attr('dx', () => -LABEL.WIDTH / 2)
            .attr('dy', (d) => LABEL.OFFSET + d.size)
            .text((d) => this.getShortAddress(d.address));

        simulation.nodes(nodes);
        simulation.force('link').links(links);
        simulation.on('tick', this.getTicked(selectedLinks, selectedNodes, width, height));
    };

    componentDidMount() {
        this.renderGraph();
    }

    componentWillUpdate() {
        const graph = select('.graph');
        graph.selectAll('*').remove();
    }

    componentDidUpdate() {
        this.renderGraph();
    }

    render() {
        return <div className="graph" />;
    }
}

export default Graph;
