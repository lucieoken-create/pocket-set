-- Integration assertions. Run as postgres in SQL editor. All fixtures roll back.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$
declare n integer; x jsonb;
begin
  perform public.merge_my_pocket_set_weights('[{"area":"Chest","weight":20.5,"date":"2025-01-02T00:00:00Z"}]');
  perform public.merge_my_pocket_set_weights('[{"area":"Chest","weight":10,"date":"2025-01-01T00:00:00Z"}]');
  if (select weight from public.pocket_set_weights where area='Chest') <> 20.5 then raise exception 'stale merge overwrote current row'; end if;
  perform public.merge_my_pocket_set_weights('[{"area":"Chest","weight":25,"date":"2025-01-03T00:00:00Z"}]');
  perform public.merge_my_pocket_set_weights('[{"area":"Chest","weight":30,"date":"2025-01-03T00:00:00Z"}]');
  if (select weight from public.pocket_set_weights where area='Chest') <> 25 then raise exception 'newer/tied timestamp behavior failed'; end if;
  begin
    insert into public.pocket_set_weights values ('22222222-2222-4222-8222-222222222222','Arms',15,'2025-01-01');
    raise exception 'cross-account insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.pocket_set_weights set user_id='22222222-2222-4222-8222-222222222222' where area='Chest';
    raise exception 'ownership reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pocket_set_weights;
    raise exception 'delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.merge_pocket_set_weights('22222222-2222-4222-8222-222222222222','[]');
    raise exception 'legacy RPC allowed';
  exception when insufficient_privilege then null; end;
  for x in select value from jsonb_array_elements('[
    [{"area":"Chest","weight":201,"date":"2025-01-01T00:00:00Z"}],
    [{"area":"Chest","weight":-1,"date":"2025-01-01T00:00:00Z"}],
    [{"area":"Chest","weight":20.25,"date":"2025-01-01T00:00:00Z"}],
    [{"area":"Unknown","weight":20,"date":"2025-01-01T00:00:00Z"}],
    [{"area":"Chest","weight":20,"date":"2099-01-01T00:00:00Z"}],
    [{"area":"Chest","weight":20,"date":"2025-01-01"}],
    [{"area":"Chest","weight":20,"date":"2025-01-01T00:00:00Z","user_id":"spoof"}],
    [{"area":"Chest","weight":"20","date":"2025-01-01T00:00:00Z"}],
    [{"area":"Chest","weight":20,"date":"2025-01-01T00:00:00Z"},{"area":"Chest","weight":20,"date":"2025-01-01T00:00:00Z"}],
    {},
    null,
    [{},{},{},{},{},{}]
  ]') loop
    begin
      perform public.merge_my_pocket_set_weights(x);
      raise exception 'invalid payload accepted: %',x;
    exception when invalid_parameter_value then null; end;
  end loop;
end;
$$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$
declare n integer;
begin
  if exists(select 1 from public.pocket_set_weights) then raise exception 'Bob sees Alice'; end if;
  update public.pocket_set_weights set weight=100 where user_id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Bob changed Alice'; end if;
  perform public.merge_my_pocket_set_weights('[{"area":"Arms","weight":15,"date":"2025-01-01T00:00:00Z"}]');
  select count(*) into n from public.merge_my_pocket_set_weights('[]');
  if n <> 1 then raise exception 'Bob RPC sees wrong rows'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$
begin
  if (select count(*) from public.pocket_set_weights) <> 1
    or (select weight from public.pocket_set_weights where area='Chest') <> 25 then
    raise exception 'Alice isolation failed';
  end if;
end;
$$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  begin perform * from public.pocket_set_weights; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.merge_my_pocket_set_weights('[]'); raise exception 'anon RPC allowed';
  exception when insufficient_privilege then null; end;
  begin insert into public.pocket_set_weights values ('anonymous','Chest',10,'2025-01-01'); raise exception 'anon write allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
select 'All RLS, merge and validation assertions passed; fixtures rolled back.' as result;

