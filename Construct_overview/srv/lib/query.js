// Minimal in-memory evaluation of the CQN that CAP passes to custom READ handlers:
// $filter, $orderby, $top/$skip and $count, so lists, tab counts and paging behave like a real OData service.

function operand(node, row) {
  if (node === null || node === undefined) return null;
  if (node.ref) return row[node.ref[node.ref.length - 1]];
  if ('val' in node) return node.val;
  if (node.list) return node.list.map(item => operand(item, row));
  if (node.xpr) return evaluate(node.xpr, row);
  if (node.func) return call(node, row);
  return undefined;
}

function call(node, row) {
  const args = (node.args || []).map(arg => operand(arg, row));
  const text = value => String(value ?? '').toLowerCase();
  switch (node.func) {
    case 'contains': return text(args[0]).includes(text(args[1]));
    case 'startswith': return text(args[0]).startsWith(text(args[1]));
    case 'endswith': return text(args[0]).endsWith(text(args[1]));
    case 'tolower': return text(args[0]);
    case 'toupper': return String(args[0] ?? '').toUpperCase();
    case 'search': return args.some(arg => text(arg).length === 0) || false;
    default: return undefined;
  }
}

function compare(left, op, right) {
  const norm = value => (typeof value === 'boolean' ? String(value) : value);
  const a = norm(left), b = norm(right);
  switch (op) {
    case '=': return a === b || String(a) === String(b);
    case '!=': case '<>': return !(a === b || String(a) === String(b));
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case 'in': return Array.isArray(b) && b.some(item => String(item) === String(a));
    case 'like': return new RegExp(`^${String(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i').test(String(a ?? ''));
    default: return false;
  }
}

// Tokens: operands, comparison operators, 'and', 'or', 'not'. `and` binds tighter than `or`.
function evaluate(tokens, row) {
  const groups = [[]];
  for (const token of tokens) {
    if (token === 'or') groups.push([]);
    else groups.at(-1).push(token);
  }
  return groups.some(group => {
    const terms = [[]];
    for (const token of group) {
      if (token === 'and') terms.push([]);
      else terms.at(-1).push(token);
    }
    return terms.every(term => {
      let negate = false;
      let items = term;
      if (items[0] === 'not') { negate = true; items = items.slice(1); }
      let result;
      if (items.length === 3 && typeof items[1] === 'string') result = compare(operand(items[0], row), items[1], operand(items[2], row));
      else if (items.length >= 3 && typeof items[1] === 'string') result = compare(operand(items[0], row), items[1], operand(items[2], row));
      else if (items.length === 1) result = Boolean(operand(items[0], row));
      else result = true;
      return negate ? !result : result;
    });
  });
}

function apply(rows, req) {
  const select = req.query?.SELECT;
  if (!select) return rows;
  let result = select.where ? rows.filter(row => evaluate(select.where, row)) : rows;
  const total = result.length;
  const countOnly = select.columns?.some(column => column.func === 'count');
  if (countOnly) return [{ $count: total, count: total }];
  if (select.orderBy?.length) {
    const explicit = select.orderBy.filter(order => !order.implicit);
    const order = explicit.length ? explicit : select.orderBy;
    result = [...result].sort((a, b) => {
      for (const { ref, sort } of order) {
        const field = ref[ref.length - 1];
        const x = a[field], y = b[field];
        if (x === y) continue;
        const direction = sort === 'desc' ? -1 : 1;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * direction;
      }
      return 0;
    });
  }
  const limit = select.limit;
  const offset = Number(limit?.offset?.val) || 0;
  const count = limit?.rows?.val !== undefined ? Number(limit.rows.val) : undefined;
  if (offset || count !== undefined) result = result.slice(offset, count === undefined ? undefined : offset + count);
  if (select.count) result.$count = total;
  return result;
}

module.exports = { apply, evaluate };
