export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROJECT_ID = '1211763087952574';
  const PHASE_FIELD_GID = '1215397981889360';
  const CHANNEL_FIELD_GID = '1213107724210215';
  const token = process.env.ASANA_TOKEN;

  if (!token) return res.status(500).json({ error: 'ASANA_TOKEN not set' });

  try {
    let allTasks = [];
    let offset = null;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        project: PROJECT_ID,
        opt_fields: [
          'gid', 'name', 'completed',
          'custom_fields', 'custom_fields.gid', 'custom_fields.name',
          'custom_fields.enum_value', 'custom_fields.enum_value.name',
          'custom_fields.enum_value.gid', 'custom_fields.multi_enum_values',
          'custom_fields.multi_enum_values.name', 'custom_fields.multi_enum_values.gid',
          'due_on', 'start_on', 'memberships.section.name', 'tags', 'tags.name'
        ].join(','),
        limit: '100',
      });
      if (offset) params.append('offset', offset);

      const response = await fetch(
        `https://app.asana.com/api/1.0/tasks?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }
      const data = await response.json();
      allTasks = allTasks.concat(data.data || []);
      offset = data.next_page?.offset || null;
      hasMore = !!offset;
    }

    // Only include tasks that have a Phase field set
    const filtered = allTasks.filter(task => {
      if (task.completed) return false;
      const phaseField = task.custom_fields?.find(f => f.gid === PHASE_FIELD_GID);
      // multi_enum_values for Phase (multi_enum type)
      const phases = phaseField?.multi_enum_values || [];
      return phases.length > 0;
    });

    // Shape the data
    const tasks = filtered.map(task => {
      const phaseField = task.custom_fields?.find(f => f.gid === PHASE_FIELD_GID);
      const channelField = task.custom_fields?.find(f => f.gid === CHANNEL_FIELD_GID);

      return {
        gid: task.gid,
        name: task.name,
        phases: (phaseField?.multi_enum_values || []).map(v => v.name),
        channel: channelField?.enum_value?.name || null,
        section: task.memberships?.[0]?.section?.name || null,
        tags: (task.tags || []).map(t => t.name),
        due_on: task.due_on || null,
        start_on: task.start_on || null,
        url: `https://app.asana.com/0/${PROJECT_ID}/${task.gid}`,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ tasks });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
